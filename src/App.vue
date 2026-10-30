<template>
  <div class="app">
    <header class="top">
      <h1>🎭 人脸情绪识歌 <span>Face Emotion Music</span></h1>
      <p class="tagline">本地人脸情绪识别 → 情绪画像 → 歌曲推荐（本地曲库 + 在线接口）</p>
    </header>

    <div class="grid">
      <!-- 左：人脸采集 + 情绪结果 -->
      <section class="card">
        <h2>① 获取人脸</h2>
        <CapturePanel @capture="onCapture" @stream="onStream" @stop="onStop" />

        <h2 class="mt">② 情绪识别</h2>
        <div v-if="loadingModels" class="status">⏳ 正在加载本地识别模型…</div>
        <div v-else-if="initError" class="status err">⚠️ {{ initError }}</div>
        <EmotionResult :expressions="result?.expressions || {}" :dominant="result?.dominant || ''" />
        <button v-if="result" class="re-trigger" @click="recommendNow">🔄 重新推荐这首歌单</button>
      </section>

      <!-- 右：推荐 + 播放 -->
      <section class="card">
        <h2>③ 歌曲推荐 <small class="h2sub">离线曲库 + 在线接口</small></h2>
        <RecommendList
          :local-list="localList"
          :online-list="onlineList"
          :loading="loading"
          :current-id="currentSong?.id || ''"
          :strategy="strategy"
          :resolved-mode="resolvedMode"
          :online-status="onlineStatus"
          :online-keyword="onlineKeyword"
          @play="playSong"
          @strategy-change="setStrategy"
          @retry-online="refreshOnline"
        />
        <h2 class="mt">④ 播放</h2>
        <MusicPlayer :song="currentSong" />
      </section>
    </div>

    <footer class="foot">
      本地算法：@vladmandic/face-api（tinyFaceDetector + faceExpressionNet，全部在浏览器端推理） ·
      推荐算法：情绪→音乐特征加权打分 ·
      歌曲：本地曲库 + 在线音乐接口
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import CapturePanel from './components/CapturePanel.vue'
import EmotionResult from './components/EmotionResult.vue'
import RecommendList from './components/RecommendList.vue'
import MusicPlayer from './components/MusicPlayer.vue'
import { useFaceEmotion } from './composables/useFaceEmotion.js'
import { useRecommend } from './composables/useRecommend.js'

// 顶层解构，模板中 ref 自动解包
const { modelsLoaded, loadingModels, initError, initModels, detect, startLoop, stopLoop } = useFaceEmotion()
const { localList, onlineList, loading, error, lastEmotion, recommend, strategy, resolvedMode, setStrategy, onlineStatus, onlineKeyword, refreshOnline } = useRecommend()

const result = ref(null)
const currentSong = ref(null)
const lastRecommendEmotion = ref('')
let recommending = false

onMounted(() => {
  initModels() // 预加载模型，提升首次识别速度
})

// 单次识别（图片 / 视频帧 / 拍照画布）
async function onCapture(el) {
  const res = await detect(el)
  if (!res) {
    result.value = null
    localList.value = []
    onlineList.value = []
    alert('未检测到人脸，请换一张更清晰、正脸的图片或调整光线。')
    return
  }
  result.value = res
  await recommendNow()
}

// 实时摄像头：开启循环识别，情绪切换时自动刷新推荐
function onStream(videoEl) {
  startLoop(videoEl, (res) => {
    result.value = res
    if (res.dominant !== lastRecommendEmotion.value) {
      recommendNow()
    }
  })
}

function onStop() {
  stopLoop()
}

async function recommendNow() {
  if (!result.value || recommending) return
  recommending = true
  lastRecommendEmotion.value = result.value.dominant
  try {
    await recommend(result.value.dominant)
  } finally {
    recommending = false
  }
}

function playSong(song) {
  currentSong.value = song
}

onBeforeUnmount(() => stopLoop())
</script>

<style scoped>
.app { max-width: 1080px; margin: 0 auto; padding: 24px 18px 40px; }
.top h1 { font-size: 24px; margin: 0; }
.top h1 span { font-size: 14px; color: #8b93a7; font-weight: 400; margin-left: 8px; }
.tagline { color: #5b6577; margin: 6px 0 0; font-size: 14px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
@media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
.card {
  background: #fff; border: 1px solid #eef1f6; border-radius: 16px;
  padding: 18px; box-shadow: 0 8px 30px rgba(20,30,60,.04);
}
.card h2 { font-size: 16px; margin: 0 0 12px; color: #2d3748; }
.card h2 .h2sub { font-size: 12px; font-weight: 400; color: #8b93a7; margin-left: 6px; }
.card h2.mt { margin-top: 22px; }
.status { font-size: 13px; color: #5b6577; padding: 8px 0; }
.status.err { color: #e55039; }
.re-trigger {
  margin-top: 14px; width: 100%; padding: 10px; border-radius: 10px;
  border: 1px solid #c9d6ff; background: #f3f7ff; color: #3b6cf6; cursor: pointer; font-size: 14px;
}
.foot { margin-top: 22px; color: #8b93a7; font-size: 12px; text-align: center; line-height: 1.6; }
</style>
