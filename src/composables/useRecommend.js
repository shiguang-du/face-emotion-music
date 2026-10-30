// ============================================================================
// 歌曲推荐引擎（核心算法）
// ----------------------------------------------------------------------------
// 输入：@vladmandic/face-api 得到的主导情绪 key（happy / sad / angry ...）
// 输出：**离线（本地曲库）+ 在线（音乐接口）** 两路推荐
//
// 离线推荐：完全在浏览器内完成，断网也能用
//   1. 取该情绪在 emotionProfile 中定义的"目标画像"(energy/valence/danceability/tags/genres)
//   2. 对本地曲库每首歌用加权距离公式算匹配分(0~100)，取 TopN
//
// 在线推荐：按情绪关键词请求在线接口，拿可播放直链
//   1. 主源 GD Studio（网易云）：关键词搜索 → 逐首解析 320kbps 直链
//   2. 备源 Meting：热歌榜歌单兜底
//   3. 全部失败时 onlineStatus='empty'，离线歌单仍然可用（降级不影响主流程）
//
// 打分公式（song 与 target 各特征越接近分越高，再加标签/曲风重合加分）：
//   score = 0.35*(1-|Δenergy|) + 0.35*(1-|Δvalence|) + 0.15*(1-|Δdanceability|)
//         + 0.10*(tag重合率) + 0.05*(genre重合率)     结果 ×100
// ============================================================================

import { ref } from 'vue'
import { EMOTIONS } from '../services/emotionProfile.js'
import { resolveTarget, STRATEGIES } from '../services/strategy.js'
import { searchOnline } from '../services/onlineMusicApi.js'
import localData from '../../public/data/localSongs.json'

const localSongs = localData.songs || []

const ONLINE_LIMIT = 5

function scoreSong(song, target) {
  const e = song.energy ?? 0.5
  const v = song.valence ?? 0.5
  const d = song.danceability ?? 0.5

  const dist =
    0.35 * (1 - Math.abs(e - target.energy)) +
    0.35 * (1 - Math.abs(v - target.valence)) +
    0.15 * (1 - Math.abs(d - target.danceability))

  const lower = (arr) => (arr || []).map((x) => String(x).toLowerCase())
  const songTags = lower(song.tags)
  const targetTags = lower(target.tags)
  const tagOverlap = targetTags.filter((t) => songTags.includes(t)).length
  const tagScore = targetTags.length ? tagOverlap / targetTags.length : 0

  const songGenres = lower(song.genres)
  const targetGenres = lower(target.genres)
  const genreOverlap = targetGenres.filter((g) => songGenres.includes(g)).length
  const genreScore = targetGenres.length ? Math.min(1, genreOverlap / 2) : 0

  return Math.round((dist + 0.1 * tagScore + 0.05 * genreScore) * 100)
}

export function useRecommend() {
  const localList = ref([])
  const onlineList = ref([])
  const loading = ref(false)
  const error = ref('')
  const lastEmotion = ref('')

  // 在线推荐状态：idle | loading | ok | empty
  const onlineStatus = ref('idle')
  const onlineKeyword = ref('')

  // 推荐策略：'auto' | 'mirror' | 'repair'（默认智能）
  const strategy = ref('auto')
  // 本次实际生效的策略（智能会被解析为 mirror 或 repair）
  const resolvedMode = ref('')

  async function recommend(emotionKey, opts = {}) {
    const profile = EMOTIONS[emotionKey]
    if (!profile) {
      error.value = '未知情绪：' + emotionKey
      return
    }
    lastEmotion.value = emotionKey

    // S1 目标决策：按当前策略把情绪画像解析为最终推荐目标
    const target = resolveTarget(strategy.value, profile.target)
    resolvedMode.value = target.mode

    loading.value = true
    error.value = ''

    // 1) 离线推荐：本地曲库打分排序（同步完成，断网可用）
    const scored = localSongs
      .map((s) => {
        const score = scoreSong(s, target)
        const reason = buildReason(s, profile, target.mode)
        return { ...s, score, source: 'local', reason }
      })
      .sort((a, b) => b.score - a.score)
    localList.value = scored.slice(0, opts.localTop || 6)

    // 2) 在线推荐：按情绪关键词请求在线接口（失败自动降级，不阻塞离线歌单）
    await loadOnline(profile.keywords[0], opts)

    loading.value = false
  }

  // 单独加载/重试在线推荐
  async function loadOnline(keyword, opts = {}) {
    const kw = String(keyword || '').trim()
    onlineKeyword.value = kw
    if (!kw) {
      onlineList.value = []
      onlineStatus.value = 'empty'
      return
    }
    onlineStatus.value = 'loading'
    const online = await searchOnline(kw, {
      limit: opts.onlineTop || ONLINE_LIMIT,
      timeout: opts.timeout || 8000
    })
    onlineList.value = online.map((s, i) => ({
      ...s,
      // 在线为关键词意图匹配，置信度略低于本地精准打分
      score: Math.max(55, 78 - i * 4),
      reason: `在线 · 关键词「${kw}」`
    }))
    onlineStatus.value = onlineList.value.length ? 'ok' : 'empty'
  }

  // 重试在线推荐（保持当前情绪）
  async function refreshOnline() {
    if (!lastEmotion.value) return
    const profile = EMOTIONS[lastEmotion.value]
    if (!profile) return
    const wasLoading = loading.value
    loading.value = true
    try {
      await loadOnline(profile.keywords[0])
    } finally {
      loading.value = wasLoading
    }
  }

  function buildReason(song, profile, mode) {
    const matched = (song.moods || []).includes(lastEmotion.value)
    if (mode === 'repair') {
      return matched ? `情绪修复 · 从「${profile.label}」向明亮平和迁移` : `情绪修复（目标已向修复锚点迁移）`
    }
    if (matched) return `曲风贴合「${profile.label}」`
    return `情绪特征匹配（能量/明亮度相近）`
  }

  function setStrategy(key) {
    strategy.value = key
    if (lastEmotion.value) recommend(lastEmotion.value)
  }

  return {
    localList,
    onlineList,
    loading,
    error,
    lastEmotion,
    recommend,
    strategy,
    resolvedMode,
    setStrategy,
    onlineStatus,
    onlineKeyword,
    refreshOnline,
    STRATEGIES
  }
}
