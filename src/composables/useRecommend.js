// ============================================================================
// 歌曲推荐引擎（核心算法）
// ----------------------------------------------------------------------------
// 输入：@vladmandic/face-api 得到的主导情绪 key（happy / sad / angry ...）
// 步骤：
//   1. 取该情绪在 emotionProfile 中定义的"目标画像"(energy/valence/danceability/tags/genres)
//   2. 本地曲库打分：对每首歌用加权距离公式算匹配分(0~100)，取 TopN
//   3. 在线接口：用情绪的搜索词请求在线 API，得到可播放直链（失败则跳过）
//   4. 返回 { local, online } 两部分推荐列表，UI 分别展示
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

    // 1) 本地曲库打分排序（使用策略解析后的 target）
    const scored = localSongs
      .map((s) => {
        const score = scoreSong(s, target)
        const reason = buildReason(s, profile, target.mode)
        return { ...s, score, source: 'local', reason }
      })
      .sort((a, b) => b.score - a.score)
    localList.value = scored.slice(0, opts.localTop || 6)

    // 2) 在线接口（关键词取情绪画像第一个搜索词）
    const keyword = profile.keywords[0]
    const online = await searchOnline(keyword, { timeout: opts.timeout || 8000 })
    onlineList.value = online.map((s, i) => ({
      ...s,
      score: 70 - i * 3, // 意图匹配，置信度略低于本地精准匹配
      source: 'online',
      reason: `在线 · 按「${keyword}」匹配`
    }))

    loading.value = false
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
    STRATEGIES
  }
}
