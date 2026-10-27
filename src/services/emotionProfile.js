// ============================================================================
// 情绪 -> 音乐特征映射（歌曲推荐算法的"目标画像"定义）
// ----------------------------------------------------------------------------
// @vladmandic/face-api 的 faceExpressionNet 输出 7 种情绪概率：
//   neutral(中性) happy(开心) sad(悲伤) angry(愤怒) fearful(恐惧) disgusted(厌恶) surprised(惊讶)
//
// 我们为每种情绪定义一个"目标音乐画像"(target profile)，包含：
//   energy      : 0~1  节奏强度/响度      （越大越燃、越躁）
//   valence     : 0~1  情绪积极度          （越大越明亮、越开心）
//   danceability: 0~1  舞动性              （越大越适合跟着动）
//   genres/tags : 推荐时匹配的曲风/标签
//   keywords    : 调用在线音乐接口时的搜索词（中文 + 英文）
// 推荐引擎会把每首候选歌曲的特征与"目标画像"做距离计算并打分排序。
// ============================================================================

export const EMOTIONS = {
  neutral: {
    label: '平静',
    emoji: '😐',
    color: '#9aa0a6',
    target: { energy: 0.5, valence: 0.5, danceability: 0.5 },
    genres: ['acoustic', 'indie', 'pop', '轻音乐'],
    tags: ['balanced', 'relaxing', 'chill', '轻松', '日常'],
    keywords: ['轻松', '日常', 'relaxed', 'acoustic', 'indie']
  },
  happy: {
    label: '开心',
    emoji: '😄',
    color: '#f7b500',
    target: { energy: 0.85, valence: 0.95, danceability: 0.8 },
    genres: ['pop', 'dance', 'kpop', 'jpop', 'edm'],
    tags: ['upbeat', 'cheerful', 'energetic', '甜美', '欢快'],
    keywords: ['快乐', '开心', '甜美', 'happy', 'upbeat', 'pop']
  },
  sad: {
    label: '悲伤',
    emoji: '😢',
    color: '#5b8def',
    target: { energy: 0.25, valence: 0.15, danceability: 0.2 },
    genres: ['ballad', 'rnb', 'folk', '钢琴'],
    tags: ['sad', 'melancholy', 'slow', 'healing', '伤感', '治愈'],
    keywords: ['伤感', '失恋', '治愈', 'sad', 'ballad', 'piano']
  },
  angry: {
    label: '愤怒',
    emoji: '😠',
    color: '#e55039',
    target: { energy: 0.92, valence: 0.2, danceability: 0.5 },
    genres: ['rock', 'metal', 'hiphop', '电音'],
    tags: ['intense', 'powerful', 'angry', '燃', '气势'],
    keywords: ['摇滚', '燃', '气势', 'rock', 'intense', 'metal']
  },
  fearful: {
    label: '恐惧',
    emoji: '😨',
    color: '#8854d0',
    target: { energy: 0.3, valence: 0.3, danceability: 0.2 },
    genres: ['ambient', 'classical', 'postrock', '轻音乐'],
    tags: ['calm', 'soothing', 'tense', '安静', '舒缓'],
    keywords: ['安静', '舒缓', '放松', 'calm', 'ambient', 'relax']
  },
  disgusted: {
    label: '厌恶',
    emoji: '🤢',
    color: '#26de81',
    target: { energy: 0.4, valence: 0.3, danceability: 0.3 },
    genres: ['lofi', 'jazz', 'chill'],
    tags: ['chill', 'mellow', 'lofi', '慵懒'],
    keywords: ['慵懒', '轻爵士', 'lofi', 'chill', 'jazz']
  },
  surprised: {
    label: '惊讶',
    emoji: '😲',
    color: '#eb3b5a',
    target: { energy: 0.7, valence: 0.7, danceability: 0.7 },
    genres: ['edm', 'funk', 'jpop', '动感'],
    tags: ['exciting', 'dynamic', 'surprise', '动感', '惊喜'],
    keywords: ['惊喜', '动感', 'edm', 'funk', 'exciting']
  }
}

export const EMOTION_KEYS = Object.keys(EMOTIONS)

// 取相似情绪的中文标签（用于 UI 展示次要情绪）
export function emotionLabel(key) {
  return EMOTIONS[key]?.label || key
}
