<template>
  <div class="shell">
    <!-- 顶部：品牌 + 状态 + 环境信息 -->
    <header class="top">
      <div class="brand">
        <div class="logo">MT</div>
        <div class="bt">
          <div class="bn">MoodTune</div>
          <div class="bs">FACE EMOTION · AUTOPLAY</div>
        </div>
      </div>

      <div class="status" :class="{ live: hasFace, bad: !!initError }">
        <span class="sdot"></span>
        <span class="st">{{ statusText }}</span>
        <span class="ss">{{ statusSub }}</span>
      </div>

      <span class="grow"></span>

      <div class="chips">
        <span class="chip">本地算力 · {{ backendLabel || '待加载' }}</span>
        <span class="chip">本地曲库 {{ localTotal }} 首</span>
        <span class="chip">{{ onlineCount ? `在线 · ${onlineCount} 首` : '在线 · 待命' }}</span>
        <button class="chip btn-chip" @click="modalOpen = true">算法说明</button>
      </div>
    </header>

    <!-- 主区 -->
    <main class="grid">
      <!-- 01 采集 -->
      <section class="card cap-card">
        <div class="card-head">
          <span class="card-no">01</span>
          <span class="card-title">采集画面</span>
          <span class="card-sub">图片 / 视频 / 摄像头 / 拍照 / 自动框选</span>
          <span class="grow"></span>
          <span class="head-chip">{{ modeLabel }}</span>
        </div>

        <CapturePanel
          v-model:threshold="threshold"
          :show-box="showBox"
          :input-size="inputSize"
          :box="smoothed?.box || null"
          :detecting="detecting"
          @update:show-box="showBox = $event"
          @capture="onCapture"
          @stream="onStream"
          @stop="onStop"
          @mode="onMode"
        />
      </section>

      <!-- 右列：02 情绪 / 03 歌单 -->
      <div class="col">
        <section class="card">
          <div class="card-head">
            <span class="card-no">02</span>
            <span class="card-title">情绪识别</span>
            <span class="card-sub">7 种情绪 · {{ WINDOW }} 帧融合 · 本地推理</span>
            <span class="grow"></span>
            <span class="head-chip">{{ frames ? `${frames} 帧` : (loadingModels ? '模型加载中' : '等待采集') }}</span>
          </div>

          <EmotionResult
            :expressions="smoothed?.expressions || {}"
            :dominant="smoothed?.dominant || ''"
            :frames="frames"
            :window-size="WINDOW"
            :loading="loadingModels"
          />
          <p v-if="initError" class="err">⚠️ {{ initError }}</p>
        </section>

        <section class="card rec-card">
          <div class="card-head">
            <span class="card-no">03</span>
            <span class="card-title">情绪歌单</span>
            <span class="card-sub">画像 → 打分 → 多样性重排</span>
            <span class="grow"></span>
            <button class="head-link" @click="modalOpen = true">算法说明 →</button>
          </div>

          <RecommendList
            v-model:tab="tab"
            :local-list="localList"
            :online-list="onlineList"
            :loading="loading"
            :current-id="currentSong?.id || ''"
            :strategy="strategy"
            :resolved-mode="resolvedMode"
            :emotion-label="emotionLabel"
            :local-total="localTotal"
            @play="play"
            @strategy-change="setStrategy"
            @regenerate="regenerate"
            @explain="modalOpen = true"
          />
        </section>
      </div>
    </main>

    <!-- 04 情绪轨迹 -->
    <section class="card tl-card">
      <div class="card-head">
        <span class="card-no">04</span>
        <span class="card-title">情绪轨迹</span>
        <span class="card-sub">最近 60 秒 · 情绪效价 −1 ~ +1</span>
        <span class="grow"></span>
        <span class="head-chip">{{ history.length }} 个采样点</span>
      </div>
      <EmotionTimeline :points="history" :window-sec="60" />
    </section>

    <!-- 播放条 -->
    <div class="dock">
      <MusicPlayer
        :song="currentSong"
        :queue-len="playlist.length"
        :hint="hasFace ? '情绪稳定 3 秒后自动播放' : '识别情绪并稳定 3 秒后自动播放'"
        @prev="step(-1)"
        @next="step(1)"
      />
    </div>

    <!-- 轻提示 -->
    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>

    <AlgorithmModal :open="modalOpen" @close="modalOpen = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import CapturePanel from './components/CapturePanel.vue'
import EmotionResult from './components/EmotionResult.vue'
import RecommendList from './components/RecommendList.vue'
import MusicPlayer from './components/MusicPlayer.vue'
import EmotionTimeline from './components/EmotionTimeline.vue'
import AlgorithmModal from './components/AlgorithmModal.vue'
import { useFaceEmotion } from './composables/useFaceEmotion.js'
import { useRecommend } from './composables/useRecommend.js'
import { EMOTIONS } from './services/emotionProfile.js'

// 滑动窗口帧数：对最近 N 帧的 7 类概率取均值，抑制单帧抖动
const WINDOW = 5

const { loadingModels, initError, backend, initModels, detect, startLoop, stopLoop } = useFaceEmotion()
const { localList, onlineList, loading, recommend, strategy, resolvedMode, setStrategy, localTotal } = useRecommend()

/* ---------------- 采集参数 ---------------- */
const threshold = ref(0.6)                       // 检测灵敏度 = scoreThreshold
const showBox = ref(true)
// 阈值低（更灵敏）时用更大的输入分辨率兜底，保证小脸也能被检出
const inputSize = computed(() => (threshold.value >= 0.6 ? 320 : 416))

const detecting = ref(false)
const modeLabel = ref('图片上传')
const MODE_LABEL = { image: '图片上传', video: '本地视频', camera: '摄像头', demo: '示例人脸' }

/* ---------------- 识别结果 ---------------- */
const smoothed = ref(null)   // { expressions, dominant, box }
const frames = ref(0)        // 累计识别帧数
const history = ref([])      // 情绪轨迹采样点 { t, v }
let buffer = []              // 滑动窗口缓冲

/* ---------------- 推荐 / 播放 ---------------- */
const tab = ref('all')
const currentSong = ref(null)
const modalOpen = ref(false)
const toast = ref('')
let toastTimer = null
let stableTimer = null
let lastRecommendFor = ''

/* ---------------- 展示态计算 ---------------- */
const hasFace = computed(() => !!smoothed.value)
const onlineCount = computed(() => onlineList.value.length)
const backendLabel = computed(() => (backend.value === 'webgl' ? 'WebGL' : backend.value === 'cpu' ? 'CPU' : ''))
const emotionLabel = computed(() => (smoothed.value ? (EMOTIONS[smoothed.value.dominant]?.label || '') : ''))

const statusText = computed(() => {
  if (initError.value) return '模型加载失败'
  if (loadingModels.value) return '正在加载模型'
  if (!smoothed.value) return '未检测'
  return EMOTIONS[smoothed.value.dominant]?.label || '识别中'
})
const statusSub = computed(() => {
  if (initError.value) return '刷新页面或查看控制台'
  if (!smoothed.value) return '等待人脸识别或入画面'
  const p = smoothed.value.expressions[smoothed.value.dominant] || 0
  return `置信度 ${Math.round(p * 100)}% · ${frames.value} 帧融合`
})

const playlist = computed(() => {
  if (tab.value === 'local') return localList.value
  if (tab.value === 'online') return onlineList.value
  return [...localList.value, ...onlineList.value]
})

/* ---------------- 识别 ---------------- */
async function onCapture(el) {
  if (!el || detecting.value) return
  detecting.value = true
  try {
    const res = await detect(el, { scoreThreshold: threshold.value, inputSize: inputSize.value })
    if (!res) {
      showToast('未检测到人脸：换张更清晰的正脸图，或把「检测灵敏度」调低一点')
      return
    }
    ingest(res, false)
    await syncRecommend()
  } catch (e) {
    initError.value = '识别失败：' + e.message
  } finally {
    detecting.value = false
  }
}

// 实时摄像头循环
function onStream(videoEl) {
  streamEl = videoEl
  startLoop(
    videoEl,
    async (res) => {
      ingest(res, true)
      await syncRecommend()
    },
    { scoreThreshold: threshold.value, inputSize: inputSize.value, intervalMs: 700, retry: false }
  )
}

function onStop() {
  streamEl = null
  stopLoop()
}

function onMode(key) {
  modeLabel.value = MODE_LABEL[key] || '采集'
}

let streamEl = null

/* ---------------- 结果融合 ---------------- */
function ingest(res, fromLoop) {
  frames.value++
  const ex = Object.assign({}, res.expressions)

  if (fromLoop) {
    buffer.push(ex)
    if (buffer.length > WINDOW) buffer.shift()
    const keys = Object.keys(ex)
    const avg = {}
    keys.forEach((k) => {
      avg[k] = buffer.reduce((s, e) => s + (e[k] || 0), 0) / buffer.length
    })
    const dominant = keys.reduce((a, b) => (avg[a] >= avg[b] ? a : b))
    smoothed.value = { expressions: avg, dominant, box: res.box }
  } else {
    buffer = [ex]
    smoothed.value = { expressions: ex, dominant: res.dominant, box: res.box }
  }

  pushHistory(smoothed.value.expressions)
}

// 连续效价：7 类概率加权成 -1~1，用于底部情绪轨迹
function valenceOf(x) {
  const v =
    1.0 * (x.happy || 0) +
    0.55 * (x.surprised || 0) +
    0.1 * (x.neutral || 0) -
    0.6 * (x.sad || 0) -
    0.8 * (x.angry || 0) -
    0.5 * (x.fearful || 0) -
    0.4 * (x.disgusted || 0)
  return Math.max(-1, Math.min(1, v))
}

function pushHistory(ex) {
  history.value.push({ t: Date.now(), v: valenceOf(ex) })
  const cut = Date.now() - 65000
  if (history.value.length > 900) history.value = history.value.filter((p) => p.t >= cut)
}

/* ---------------- 推荐 ---------------- */
async function syncRecommend(force = false) {
  const d = smoothed.value?.dominant
  if (!d) return
  if (!force && d === lastRecommendFor) return
  lastRecommendFor = d
  await recommend(d)
}

async function regenerate() {
  if (!smoothed.value) {
    showToast('先识别一张人脸，才能按情绪生成歌单')
    return
  }
  await syncRecommend(true)
}

// 情绪稳定 3 秒 → 自动播第一首
watch(
  () => smoothed.value?.dominant,
  (d) => {
    clearTimeout(stableTimer)
    if (!d) return
    stableTimer = setTimeout(() => {
      if (!currentSong.value && playlist.value.length) play(playlist.value[0])
    }, 3000)
  }
)

/* ---------------- 播放控制 ---------------- */
function play(song) {
  currentSong.value = song
}

function step(dir) {
  const list = playlist.value
  if (!list.length) return
  const idx = list.findIndex((s) => s.id === currentSong.value?.id)
  const next = idx === -1 ? 0 : (idx + dir + list.length) % list.length
  play(list[next])
}

/* ---------------- 其它 ---------------- */
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 3200)
}

// 灵敏度变化时，实时摄像头要用新参数重开循环
watch([threshold, inputSize], () => {
  if (streamEl) onStream(streamEl)
})

onMounted(() => {
  initModels()
})

onBeforeUnmount(() => {
  stopLoop()
  clearTimeout(stableTimer)
  clearTimeout(toastTimer)
})
</script>

<style scoped>
.shell {
  max-width: 1280px; margin: 0 auto; padding: 14px 16px 16px;
  display: flex; flex-direction: column; gap: 12px;
}

/* 顶部 */
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.brand {
  display: flex; align-items: center; gap: 9px;
  background: var(--dark); color: #fff;
  border-radius: 12px; padding: 7px 14px 7px 8px;
}
.logo {
  width: 26px; height: 26px; border-radius: 8px; background: #fff; color: #161719;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; letter-spacing: .02em;
}
.bn { font-size: 12.5px; font-weight: 650; line-height: 1.2; }
.bs { font-size: 8px; color: #8e8f95; letter-spacing: .09em; }

.status {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  padding: 7px 14px; font-size: 11.5px; color: var(--ink-2);
}
.sdot { width: 6px; height: 6px; border-radius: 50%; background: #cfcdc7; flex: 0 0 6px; }
.status.live { border-color: #cfe9dc; }
.status.live .sdot { background: var(--ok); box-shadow: 0 0 0 3px rgba(47, 163, 107, .14); }
.status.bad { border-color: #f2d0cc; }
.status.bad .sdot { background: var(--danger); }
.st { font-weight: 600; }
.ss { color: var(--muted); font-size: 10.5px; }

.grow { flex: 1; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  padding: 6px 11px; font-size: 10.5px; color: var(--muted);
}
.btn-chip { cursor: pointer; color: var(--ink-2); }
.btn-chip:hover { border-color: #d5cdfb; color: var(--accent-ink); }

/* 主区 */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.34fr) minmax(340px, .94fr);
  gap: 12px;
  align-items: start;
}
.col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.cap-card { display: flex; flex-direction: column; }
.cap-card :deep(.cap) { flex: 1; }
.rec-card { flex: 1; display: flex; flex-direction: column; }

.err { margin: 0; padding: 0 14px 12px; font-size: 11.5px; color: var(--danger); }

/* 轨迹 */
.tl-card { padding-bottom: 6px; }

/* 播放器吸底 */
.dock { position: sticky; bottom: 8px; z-index: 20; }

/* 提示 */
.toast {
  position: fixed; left: 50%; bottom: 92px; transform: translateX(-50%);
  background: rgba(22, 23, 25, .92); color: #fff; font-size: 12px;
  padding: 9px 16px; border-radius: 999px; z-index: 60;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .2);
  max-width: 82vw;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 6px); }

@media (max-width: 1000px) {
  .grid { grid-template-columns: 1fr; }
  .chips { width: 100%; }
}
</style>
