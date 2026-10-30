<template>
  <div class="capture">
    <div class="tabs">
      <button
        v-for="m in modes"
        :key="m.key"
        :class="{ active: mode === m.key }"
        @click="switchMode(m.key)"
      >
        {{ m.icon }} {{ m.label }}
      </button>
    </div>

    <div class="stage">
      <!-- 示例人脸画廊 -->
      <div v-if="mode === 'demo'" class="demo-gallery">
        <button
          v-for="f in demoFaces"
          :key="f.key"
          class="demo-item"
          :title="'点击识别：' + f.label"
          @click="pickDemo(f.key)"
        >
          <img :src="demoSrc(f.key)" :alt="f.label" loading="lazy" />
          <span class="demo-tag">{{ f.emoji }} {{ f.label }}</span>
        </button>
      </div>

      <!-- 图片预览 -->
      <img
        v-if="mode === 'image' && imgSrc"
        ref="imgEl"
        :src="imgSrc"
        class="preview"
        alt="预览"
        @load="onImgLoad"
      />

      <!-- 视频/摄像头画面 -->
      <video
        v-if="mode === 'video' || mode === 'camera' || mode === 'photo'"
        ref="videoEl"
        class="preview"
        :controls="mode === 'video'"
        autoplay
        playsinline
        muted
      ></video>

      <!-- 拍照结果画布 -->
      <canvas v-if="mode === 'photo' && shotSrc" ref="canvasEl" :src="shotSrc" class="preview"></canvas>

      <div v-if="!hasMedia && mode !== 'demo'" class="placeholder">
        {{ placeholderText }}
      </div>
    </div>

    <div class="controls">
      <template v-if="mode === 'image'">
        <input ref="fileImage" type="file" accept="image/*" hidden @change="onImageSelected" />
        <button class="primary" @click="fileImage.click()">📁 选择图片</button>
        <button :disabled="!imgEl" @click="emitCapture(imgEl)">🔍 识别这张图</button>
      </template>

      <template v-else-if="mode === 'video'">
        <input ref="fileVideo" type="file" accept="video/*" hidden @change="onVideoSelected" />
        <button class="primary" @click="fileVideo.click()">🎞 打开视频文件</button>
        <button :disabled="!videoReady" @click="emitCapture(videoEl)">⏸ 识别当前帧</button>
      </template>

      <template v-else-if="mode === 'camera'">
        <button v-if="!cameraOn" class="primary" @click="startCamera">📷 开启摄像头</button>
        <button v-else class="danger" @click="stopCamera">⏹ 关闭摄像头</button>
        <span class="hint">实时识别中…</span>
      </template>

      <template v-else-if="mode === 'photo'">
        <button v-if="!cameraOn" class="primary" @click="startCamera">📷 开启摄像头</button>
        <button v-else class="primary" :disabled="!videoReady" @click="takePhoto">📸 拍照并识别</button>
        <button v-if="cameraOn" class="danger" @click="stopCamera">⏹ 关闭摄像头</button>
      </template>
    </div>

    <p v-if="err" class="err">⚠️ {{ err }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'

const emit = defineEmits(['capture', 'stream', 'stop'])
const modes = [
  { key: 'demo', label: '示例人脸', icon: '🎭' },
  { key: 'image', label: '图片', icon: '🖼' },
  { key: 'video', label: '视频', icon: '🎞' },
  { key: 'camera', label: '实时摄像头', icon: '📹' },
  { key: 'photo', label: '拍照', icon: '📸' }
]

// 7 种情绪的真实示例人脸（public/demo-faces/<key>/<key>.jpg，640px 压缩版，约 70KB/张）
const demoFaces = [
  { key: 'neutral', label: '平静', emoji: '😐' },
  { key: 'happy', label: '开心', emoji: '😄' },
  { key: 'sad', label: '悲伤', emoji: '😢' },
  { key: 'angry', label: '愤怒', emoji: '😠' },
  { key: 'fearful', label: '恐惧', emoji: '😨' },
  { key: 'disgusted', label: '厌恶', emoji: '🤢' },
  { key: 'surprised', label: '惊讶', emoji: '😲' }
]

function demoSrc(key) {
  return `${import.meta.env.BASE_URL}demo-faces/${key}/${key}.jpg`
}

const mode = ref('demo')
const imgEl = ref(null)
const videoEl = ref(null)
const canvasEl = ref(null)
const fileImage = ref(null)
const fileVideo = ref(null)

const imgSrc = ref('')
const shotSrc = ref('')
const videoReady = ref(false)
const cameraOn = ref(false)
const err = ref('')

let stream = null

const hasMedia = computed(() => imgSrc.value || videoReady.value || shotSrc.value)
const placeholderText = computed(() => {
  switch (mode.value) {
    case 'demo': return '点击下方任意一张示例人脸即可自动识别'
    case 'image': return '选择一张包含人脸的图片'
    case 'video': return '打开一个视频文件，识别某一帧'
    case 'camera': return '开启摄像头后自动实时识别情绪'
    case 'photo': return '开启摄像头后点击拍照，对单帧识别'
    default: return ''
  }
})

function resetMedia() {
  imgSrc.value = ''
  shotSrc.value = ''
  videoReady.value = false
  stopCamera()
}

function switchMode(key) {
  resetMedia()
  mode.value = key
  err.value = ''
}

function onImgLoad() {
  videoReady.value = false
}

// 点击示例人脸：加载图片 → 切到图片预览 → 直接触发识别
function pickDemo(key) {
  err.value = ''
  const url = demoSrc(key)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    imgSrc.value = url
    shotSrc.value = ''
    mode.value = 'image'
    emit('capture', img)
  }
  img.onerror = () => { err.value = '示例图片加载失败，请确认 public/demo-faces 资源存在' }
  img.src = url
}

function onImageSelected(e) {
  const f = e.target.files?.[0]
  if (!f) return
  imgSrc.value = URL.createObjectURL(f)
  shotSrc.value = ''
  err.value = ''
}

function onVideoSelected(e) {
  const f = e.target.files?.[0]
  if (!f) return
  stopCamera()
  const url = URL.createObjectURL(f)
  const v = videoEl.value
  v.srcObject = null
  v.src = url
  v.loop = true
  v.muted = true
  v.play()
  v.onloadeddata = () => { videoReady.value = true }
  err.value = ''
}

async function startCamera() {
  err.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    const v = videoEl.value
    v.srcObject = stream
    v.src = ''
    v.muted = true
    v.playsInline = true
    await v.play()
    cameraOn.value = true
    videoReady.value = true
    emit('stream', v) // 通知父组件开启实时识别循环
  } catch (e) {
    err.value = '无法访问摄像头：' + e.message + '（请检查浏览器权限）'
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  if (videoEl.value) {
    videoEl.value.srcObject = null
  }
  cameraOn.value = false
  videoReady.value = false
  emit('stop')
}

function takePhoto() {
  const v = videoEl.value
  if (!v || !videoReady.value) return
  const cvs = document.createElement('canvas')
  cvs.width = v.videoWidth || 480
  cvs.height = v.videoHeight || 360
  cvs.getContext('2d').drawImage(v, 0, 0, cvs.width, cvs.height)
  shotSrc.value = cvs.toDataURL('image/png')
  // 用真实 canvas 元素传给父组件识别
  emitCapture(cvs)
}

function emitCapture(el) {
  if (!el) return
  emit('capture', el)
}

onBeforeUnmount(stopCamera)
</script>

<style scoped>
.capture { display: flex; flex-direction: column; gap: 12px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.tabs button {
  border: 1px solid #d9dee5; background: #fff; color: #4a5568;
  padding: 8px 12px; border-radius: 10px; cursor: pointer; font-size: 14px;
  transition: all .15s;
}
.tabs button.active { background: #3b6cf6; color: #fff; border-color: #3b6cf6; }
.stage {
  position: relative; width: 100%; aspect-ratio: 4/3; background: #0f1320;
  border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center;
}
.preview { width: 100%; height: 100%; object-fit: contain; background: #000; }
canvas.preview { display: block; }
.placeholder { color: #8b93a7; font-size: 14px; padding: 0 16px; text-align: center; }
.demo-gallery {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  width: 100%; height: 100%; padding: 10px; overflow-y: auto; align-content: start;
}
.demo-item {
  position: relative; padding: 0; border: 2px solid transparent; border-radius: 10px;
  overflow: hidden; cursor: pointer; background: #1a1f2e; aspect-ratio: 1;
  transition: transform .12s, border-color .12s;
}
.demo-item:hover { transform: translateY(-2px); border-color: #3b6cf6; }
.demo-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.demo-tag {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 12px; color: #fff;
  padding: 8px 4px 4px; text-align: center;
  background: linear-gradient(transparent, rgba(0,0,0,.75));
}
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.controls button {
  border: 1px solid #d9dee5; background: #fff; color: #2d3748;
  padding: 9px 14px; border-radius: 10px; cursor: pointer; font-size: 14px;
}
.controls button.primary { background: #3b6cf6; color: #fff; border-color: #3b6cf6; }
.controls button.danger { background: #fff; color: #e55039; border-color: #f3b7ad; }
.controls button:disabled { opacity: .5; cursor: not-allowed; }
.controls .hint { color: #5b8def; font-size: 13px; }
.err { color: #e55039; font-size: 13px; margin: 0; }
</style>
