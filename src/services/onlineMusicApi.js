// ============================================================================
// 在线歌曲接口服务（可插拔）
// ----------------------------------------------------------------------------
// 默认使用公共接口 api.vvhan.com（返回可直接播放的 mp3 直链，且开启 CORS）。
// 该接口为第三方公共服务，可能随网络/政策变动；若失败，推荐引擎会自动回退到
// 本地曲库，保证系统始终可用。你也可以把 ONLINE_API_ENDPOINT 改成自己可用的接口。
//
// 接口约定（默认）： GET https://api.vvhan.com/api/music?name=<关键词>
// 返回示例： { code:200, data:{ name, artist, url, pic, lyric } } 或顶层扁平字段
// ============================================================================

export const ONLINE_API_ENDPOINT = 'https://api.vvhan.com/api/music'

// 若默认接口不可用，可在此切换为其它返回直链的接口（保持相同字段映射即可）
// 例如某 Netease 镜像：'https://your-mirror.example.com/song?name='
export const FALLBACK_API_ENDPOINT = ''

/**
 * 调用在线接口按关键词搜索一首歌
 * @param {string} keyword 搜索词（中文/英文均可）
 * @param {object} [opts]
 * @param {number} [opts.timeout=8000] 超时毫秒
 * @returns {Promise<Array<{title,artist,url,cover,source}>>}
 */
export async function searchOnline(keyword, opts = {}) {
  const endpoint = ONLINE_API_ENDPOINT || FALLBACK_API_ENDPOINT
  if (!endpoint) return []
  const timeout = opts.timeout || 8000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const resp = await fetch(`${endpoint}?name=${encodeURIComponent(keyword)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const json = await resp.json()
    const list = normalizeVvhan(json)
    return list
  } catch (e) {
    // 网络/CORS/超时等错误：返回空，由推荐引擎回退本地曲库
    console.warn('[onlineMusicApi] 在线搜索失败，回退本地曲库：', e.message)
    return []
  } finally {
    clearTimeout(timer)
  }
}

// 兼容多种返回结构，提取出可播放的歌曲对象
function normalizeVvhan(json) {
  if (!json) return []
  const data = json.data && typeof json.data === 'object' ? json.data : json
  const pick = (...keys) => keys.map((k) => data[k]).find((v) => v && typeof v === 'string')

  const url = pick('url', 'play_url', 'src', 'mp3')
  if (!url) return []

  const song = {
    id: 'online-' + Date.now(),
    title: pick('name', 'title', 'song', 'music_name', 'songname') || '未知歌曲',
    artist: pick('artist', 'singer', 'author', 'artists') || '未知艺人',
    url,
    cover: pick('pic', 'cover', 'img', 'image'),
    source: 'online'
  }
  return [song]
}
