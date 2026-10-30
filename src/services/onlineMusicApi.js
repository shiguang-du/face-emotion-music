// ============================================================================
// 在线歌曲接口服务（多源 + 自动降级 + 直链自愈）
// ----------------------------------------------------------------------------
// 设计原则：在线推荐是"锦上添花"，任何一步失败都不能影响离线曲库可用性。
//
// 主源：GD Studio 音乐 API（网易云）
//   GET https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=<kw>&count=N
//       -> [{ id, name, artist[], album, pic_id, url_id }]
//   GET ...?types=url&source=netease&id=<url_id>&br=320   -> { url }   （可播放直链）
//   GET ...?types=pic&source=netease&id=<pic_id>&size=300 -> { url }   （封面）
//
// 备源：Meting API（网易云歌单，一次请求即返回多首完整可播歌曲）
//   GET https://api.injahow.cn/meting/?type=playlist&id=<playlistId>&limit=N
//       -> [{ name, artist, url, pic }]
//
// 注意：网易云直链带时间戳会过期（数小时后 403），因此：
//   1) 每次推荐都实时解析直链，不复用缓存；
//   2) 播放报错时用 resolveStreamUrl() 按 sourceId 重新解析一次。
// ============================================================================

const GD_API = 'https://music-api.gdstudio.xyz/api.php'
const METING_API = 'https://api.injahow.cn/meting/'
// 兜底歌单：网易云热歌榜（稳定、可播率高）
const FALLBACK_PLAYLIST_ID = 3778678

const DEFAULT_LIMIT = 5
// 该接口对并发敏感：>6 个并发请求会直接连接失败，因此限制并发并做轻量重试
const CONCURRENCY = 2

async function getJson(url, timeout = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

/** 带重试的请求（用于直链解析这类关键请求） */
async function getJsonRetry(url, timeout = 8000, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await getJson(url, timeout)
    } catch (e) {
      lastErr = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  throw lastErr
}

/** 并发池：限制同时进行的任务数，避免触发接口连接限制 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length).fill(null)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      try {
        out[idx] = await fn(items[idx], idx)
      } catch (e) {
        out[idx] = null
      }
    }
  })
  await Promise.all(workers)
  return out
}

/** 主源：关键词搜索 → 限并发解析直链 + 封面（VIP/无版权解析失败的会自动剔除） */
async function searchGdstudio(keyword, limit, timeout) {
  const count = Math.max(limit + 2, 7)
  const url =
    `${GD_API}?types=search&source=netease&name=${encodeURIComponent(keyword)}&count=${count}`
  const list = await getJsonRetry(url, timeout)
  if (!Array.isArray(list) || !list.length) return []

  // 每首歌的直链+封面在同一个任务内顺序请求，配合并发池控制总并发
  const results = await mapLimit(list.slice(0, count), CONCURRENCY, async (it) => {
    const sid = it.url_id || it.id
    if (!sid) return null
    const play = await getJsonRetry(`${GD_API}?types=url&source=netease&id=${sid}&br=320`, timeout)
    if (!play || !play.url) return null
    let cover = ''
    if (it.pic_id) {
      try {
        const pic = await getJson(`${GD_API}?types=pic&source=netease&id=${it.pic_id}&size=300`, timeout)
        cover = (pic && pic.url) || ''
      } catch {
        // 封面失败不影响播放，用占位图
      }
    }
    return {
      id: 'online-gd-' + it.id,
      title: it.name || '未知歌曲',
      artist: Array.isArray(it.artist) ? it.artist.join(' / ') : it.artist || '未知艺人',
      album: it.album || '',
      url: play.url,
      cover,
      source: 'online',
      provider: 'gdstudio',
      sourceId: String(sid)
    }
  })

  return results.filter(Boolean)
}

/** 备源：Meting 歌单，一次请求返回多首（url 为稳定的代理地址，不过期） */
async function searchMeting(limit, timeout) {
  const arr = await getJsonRetry(`${METING_API}?type=playlist&id=${FALLBACK_PLAYLIST_ID}&limit=${limit}`, timeout)
  if (!Array.isArray(arr) || !arr.length) return []
  return arr.slice(0, limit).map((it, i) => ({
    id: 'online-mt-' + i + '-' + (it.name || ''),
    title: it.name || '未知歌曲',
    artist: it.artist || '未知艺人',
    album: '',
    url: it.url,
    cover: it.pic || '',
    source: 'online',
    provider: 'meting'
  }))
}

function dedupe(list) {
  const seen = new Set()
  return list.filter((s) => {
    const key = `${s.title}|${s.artist}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 按关键词搜索在线歌曲
 * @param {string} keyword
 * @param {object} [opts]
 * @param {number} [opts.limit=5]
 * @param {number} [opts.timeout=8000]
 * @returns {Promise<Array>} 可播放的在线歌曲；全部源失败时返回 []
 */
export async function searchOnline(keyword, opts = {}) {
  const kw = String(keyword || '').trim()
  if (!kw) return []
  const limit = Math.max(1, Math.min(opts.limit || DEFAULT_LIMIT, 8))
  const timeout = opts.timeout || 8000

  // 1) 主源
  let got = []
  try {
    got = await searchGdstudio(kw, limit, timeout)
  } catch (e) {
    console.warn('[online] 主源不可用：', e.message)
  }
  if (got.length >= Math.min(2, limit)) return dedupe(got).slice(0, limit)

  // 2) 主源结果不足时，用备源补齐
  try {
    const extra = await searchMeting(limit, timeout)
    const merged = dedupe([...got, ...extra])
    if (merged.length) return merged.slice(0, limit)
  } catch (e) {
    console.warn('[online] 备源不可用：', e.message)
  }

  return dedupe(got).slice(0, limit)
}

/**
 * 重新解析在线歌曲直链（网易云直链会过期，播放失败时调用）
 * @returns {Promise<string>} 新的可播放地址；失败返回空串
 */
export async function resolveStreamUrl(song, opts = {}) {
  if (!song) return ''
  const timeout = opts.timeout || 8000
  if (song.provider === 'gdstudio' && song.sourceId) {
    try {
      const data = await getJson(
        `${GD_API}?types=url&source=netease&id=${song.sourceId}&br=320`,
        timeout
      )
      return (data && data.url) || ''
    } catch (e) {
      console.warn('[online] 直链刷新失败：', e.message)
      return ''
    }
  }
  // meting 的地址是稳定代理，原样返回
  return song.url || ''
}
