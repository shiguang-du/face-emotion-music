<template>
  <div class="cap">
    <!-- 输入方式切换 -->
    <div class="seg">
      <button
        v-for="m in tabs"
        :key="m.key"
        class="seg-btn"
        :class="{ on: mode === m.key }"
        @click="switchMode(m.key)"
      >
        {{ m.label }}
      </button>
    </div>

    <!-- 画面舞台 -->
    <div
      ref="stageEl"
      class="stage"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <!-- 示例人脸画廊 -->
      <div v-if="mode === 'demo'" class="demo-grid">
        <button v-for="f in demoFaces" :key="f.key" class="demo-item" :title="'点击识别：' + f.label" @click="pickDemo(f.key)">
          <img :src="demoSrc(f.key)" :alt="f.label" loading="lazy" />
          <span class="demo-cap">{{ f.emoji }} {{ f.label }}</span>
        </button>
      </div>

      <!-- 图片预览 -->
      <img
        v-else-if="mode === 'image' && imgSrc"
        ref="imgEl"
        class="media"
        :src="imgSrc"
        alt="预览"
        @load="onImgLoad"
      />

      <!-- 视频 / 摄像头 -->
      <video
        v-else-if="mode === 'video' || mode === 'camera'"
        ref="videoEl"
        class="media"
        :controls="mode === 'video'"
        autoplay
        playsinline
        muted
        @loadeddata="onVideoReady"
      ></video>

      <!-- 空态 -->
      <div v-if="!hasMedia && mode !== 'demo'" class="empty">
        <div class="empty-ico">🖼</div>
        <p class="empty-title">{{ emptyTitle }}</p>
        <p class="empty-sub">{{ emptySub }}</p>
        <div class="empty-chips">
          <button @click="pickDemo('sad')">😢 示例：悲伤人脸</button>
          <button @click="pickDemo('neutral')">😐 示例：平静人脸</button>
          <button @click="pickDemo('happy')">😄 示例：开心人脸</button>
        </div>
      </div>

      <!-- 人脸框（自动框选） -->
      <div v-if="showBox && boxStyle" class="facebox" :style="boxStyle"></div>

      <!-- 拍照定格层 -->
      <canvas v-show="!!shotSrc" ref="shotCanvas" class="media shot"></canvas>

      <div class="stage-foot">
        <span class="count">
          <span class="dot" :class="{ live: hasMedia }"></span>
          {{ faceLabel }}
        </span>
        <span v-if="detecting" class="scanning">识别中…</span>
      </div>

      <div v-if="dragging" class="drop-hint">松手即可载入</div>
    </div>

    <!-- 操作条 -->
    <div class="bar">
      <input ref="fileImage" type="file" accept="image/*" hidden @change="onImageSelected" />
      <input ref="fileVideo" type="file" accept="video/*" hidden @change="onVideoSelected" />

      <button class="btn dark" @click="primaryAction">{{ primaryLabel }}</button>
      <button class="btn ghost" :disabled="!lastEl || detecting" @click="reDetect">重新识别</button>
      <button v-if="mode === 'camera' && cameraOn" class="btn ghost" :disabled="!videoReady" @click="takePhoto">
        📸 拍照识别
      </button>
      <span class="grow"></span>
      <span class="fname">{{ fileName || '未选择文件' }}</span>
    </div>

    <!-- 检测参数 -->
    <div class="tune">
      <span class="tune-label">检测灵敏度</span>
      <input
        class="slider"
        type="range"
        min="0.2"
        max="0.9"
        step="0.05"
        :value="threshold"
        @input="$emit('update:threshold', Number($event.target.value))"
      />
      <span class="tune-val">{{ Number(threshold).toFixed(2) }}</span>
      <span class="tune-meta">scoreThreshold {{ Number(threshold).toFixed(2) }} · inputSize {{ inputSize }}</span>
      <label class="switch">
        <input type="checkbox" :checked="showBox" @change="$emit('update:show-box', $event.target.checked)" />
        人脸框
      </label>
    </div>

    <p v-if="err" class="err">⚠️ {{ err }}</p>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount, onMounted } from 'vue'

const props = defineProps({
  threshold: { type: Number, default: 0.6 },
  inputSize: { type: Number, default: 320 },
  showBox: { type: Boolean, default: true },
  box: { type: Object, default: null },
  detecting: { type: Boolean, default: false }
})

const emit = defineEmits(['capture', 'stream', 'stop', 'update:threshold', 'update:show-box', 'mode'])

const tabs = [
  { key: 'image', label: '图片上传' },
  { key: 'video', label: '本地视频' },
  { key: 'camera', label: '摄像头' },
  { key: 'demo', label: '示例人脸' }
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

const mode = ref('image')
const stageEl = ref(null)
const imgEl = ref(null)
const videoEl = ref(null)
const shotCanvas = ref(null)
const fileImage = ref(null)
const fileVideo = ref(null)

const imgSrc = ref('')
const shotSrc = ref('')
const videoReady = ref(false)
const cameraOn = ref(false)
const dragging = ref(false)
const err = ref('')
const fileName = ref('')
const nat = ref({ w: 0, h: 0 }) // 素材原始尺寸，用于把人脸框换算到显示坐标

let stream = null
const lastEl = ref(null) // 最近一次可识别的元素（图片/视频/画布）

const hasMedia = computed(() => !!(imgSrc.value || videoReady.value))
const faceLabel = computed(() => {
  if (mode.value === 'demo') return '点击任意示例即可识别'
  if (props.box) return '1 张人脸'
  return hasMedia.value ? '0 张人脸' : '未载入画面'
})

const emptyTitle = computed(() => {
  switch (mode.value) {
    case 'video': return '打开本地视频，识别任意一帧'
    case 'camera': return '开启摄像头，实时读取你的表情'
    default: return '拖入图片，或点击下方按钮上传'
  }
})
const emptySub = computed(() => {
  switch (mode.value) {
    case 'video': return '支持 MP4 / WebM / MOV，播放到想要的一帧点「识别当前帧」'
    case 'camera': return '需要浏览器授权；画面仅在本机处理，不上传任何服务器'
    default: return '支持 JPG / PNG / WebP，也可以直接粘贴图片（Ctrl+V）'
  }
})

const primaryLabel = computed(() => {
  switch (mode.value) {
    case 'video': return '打开视频'
    case 'camera': return cameraOn.value ? '关闭摄像头' : '开启摄像头'
    case 'demo': return '上传图片'
    default: return '上传图片'
  }
})

function primaryAction() {
  if (mode.value === 'video') { fileVideo.value?.click(); return }
  if (mode.value === 'camera') {
    if (cameraOn.value) stopCamera()
    else startCamera()
    return
  }
  if (mode.value === 'demo') { switchMode('image'); setTimeout(() => fileImage.value?.click(), 0); return }
  fileImage.value?.click()
}

function resetMedia() {
  imgSrc.value = ''
  shotSrc.value = ''
  videoReady.value = false
  fileName.value = ''
  nat.value = { w: 0, h: 0 }
  lastEl.value = null
  stopCamera()
}

function switchMode(key) {
  if (mode.value === key) return
  resetMedia()
  mode.value = key
  err.value = ''
  emit('mode', key)
}

function onImgLoad() {
  videoReady.value = false
  const el = imgEl.value
  if (el) nat.value = { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height }
  lastEl.value = el
}

function onVideoReady() {
  const v = videoEl.value
  if (v && v.videoWidth) nat.value = { w: v.videoWidth, h: v.videoHeight }
  videoReady.value = true
  lastEl.value = v
}

// 点击示例人脸：切到 image 模式 → 用挂载在 DOM 中的 <img> 加载 → 加载完成后触发识别
// 关键点：用 DOM 中的 img（而非 new Image() 裸对象）做识别，tfjs 像素读取最稳定，
// 且同源图片无需 crossOrigin，避免 canvas 被污染导致识别抛错。
async function pickDemo(key) {
  err.value = ''
  const url = demoSrc(key)
  if (mode.value !== 'image') {
    mode.value = 'image'
    await nextTick() // 等 <img ref="imgEl"> 挂载出来
  }
  imgSrc.value = url
  fileName.value = `${key}.jpg`
  emit('mode', 'image')
  await nextTick() // 等 Vue 把 src 真正写入 DOM
  const ok = await waitImg(imgEl.value)
  if (!ok) {
    err.value = '示例图片加载失败，请确认 public/demo-faces 资源存在'
    return
  }
  nat.value = { w: imgEl.value.naturalWidth, h: imgEl.value.naturalHeight }
  lastEl.value = imgEl.value
  emit('capture', imgEl.value)
}

// 等待 DOM <img> 真正解码完成（已被 Vue 写入 src 之后调用）
function waitImg(img) {
  return new Promise((resolve) => {
    if (!img) return resolve(false)
    if (img.complete && img.naturalWidth > 0) return resolve(true)
    let done = false
    const onLoad = () => { if (done) return; done = true; cleanup(); resolve(img.naturalWidth > 0) }
    const onErr = () => { if (done) return; done = true; cleanup(); resolve(false) }
    const cleanup = () => {
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onErr)
    }
    img.addEventListener('load', onLoad)
    img.addEventListener('error', onErr)
    // 兜底：极端情况下 5s 内未就绪就以当前状态返回，避免卡死
    setTimeout(() => { if (!done) { done = true; cleanup(); resolve(img.naturalWidth > 0) } }, 5000)
  })
}

async function acceptFile(f) {
  if (!f) return
  if (f.type.startsWith('video/')) {
    if (mode.value !== 'video') switchMode('video')
    await nextTick() // 等 video 元素渲染出来再挂 src
    applyVideo(f)
  } else if (f.type.startsWith('image/')) {
    if (mode.value !== 'image') switchMode('image')
    applyImage(f)
  }
}

function applyImage(f) {
  const url = URL.createObjectURL(f)
  imgSrc.value = url
  shotSrc.value = ''
  fileName.value = f.name
  err.value = ''
}

function applyVideo(f) {
  stopCamera()
  const url = URL.createObjectURL(f)
  const v = videoEl.value
  if (!v) return
  v.srcObject = null
  v.src = url
  v.loop = true
  v.muted = true
  v.play().catch(() => {})
  fileName.value = f.name
  err.value = ''
}

function onImageSelected(e) {
  applyImage(e.target.files?.[0])
  e.target.value = ''
}

function onVideoSelected(e) {
  applyVideo(e.target.files?.[0])
  e.target.value = ''
}

// 拖拽 / 粘贴
function onDrop(e) {
  dragging.value = false
  acceptFile(e.dataTransfer?.files?.[0])
}

function onPaste(e) {
  if (mode.value === 'video' || mode.value === 'camera') return
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
  if (!item) return
  const f = item.getAsFile()
  if (f) acceptFile(f)
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
    fileName.value = '摄像头实时画面'
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
  if (videoEl.value) videoEl.value.srcObject = null
  if (cameraOn.value) emit('stop')
  cameraOn.value = false
  videoReady.value = false
}

function takePhoto() {
  const v = videoEl.value
  if (!v || !videoReady.value) return
  const cvs = shotCanvas.value
  cvs.width = v.videoWidth || 480
  cvs.height = v.videoHeight || 360
  cvs.getContext('2d').drawImage(v, 0, 0, cvs.width, cvs.height)
  shotSrc.value = cvs.toDataURL('image/jpeg', 0.9)
  nat.value = { w: cvs.width, h: cvs.height }
  lastEl.value = cvs
  emit('capture', cvs)
}

function reDetect() {
  if (lastEl.value) emit('capture', lastEl.value)
}

// 人脸框：把原图坐标按 object-fit: contain 的比例映射到舞台显示坐标
const boxStyle = computed(() => {
  const b = props.box
  const st = stageEl.value
  if (!b || !st || !nat.value.w) return null
  const sw = st.clientWidth
  const sh = st.clientHeight
  const scale = Math.min(sw / nat.value.w, sh / nat.value.h)
  const dw = nat.value.w * scale
  const dh = nat.value.h * scale
  const ox = (sw - dw) / 2
  const oy = (sh - dh) / 2
  return {
    left: `${ox + b.x * scale}px`,
    top: `${oy + b.y * scale}px`,
    width: `${b.width * scale}px`,
    height: `${b.height * scale}px`
  }
})

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  stopCamera()
})

defineExpose({ reDetect })
</script>

<style scoped>
.cap { display: flex; flex-direction: column; gap: 12px; padding: 0 14px 14px; }

/* 分段控件 */
.seg {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  background: #f4f3ef;
  border: 1px solid var(--line-soft);
  border-radius: 11px;
  padding: 4px;
}
.seg-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  padding: 7px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: all .16s;
  white-space: nowrap;
}
.seg-btn:hover { color: var(--ink-2); }
.seg-btn.on {
  background: #fff;
  color: var(--ink);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(24, 24, 24, .1);
}

/* 舞台 */
.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: #faf9f6;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage.dragging { border-color: var(--accent); background: var(--accent-soft); }
.media { width: 100%; height: 100%; object-fit: contain; background: #f2f1ed; }
canvas.media { display: block; }
.shot { position: absolute; inset: 0; }

.empty {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 12px 18px; max-width: none;
  background: #faf9f6;
}
.empty-ico {
  width: 46px; height: 46px; margin: 0 auto 12px;
  border-radius: 12px; background: #f1efeb;
  display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.empty-title { margin: 0; font-size: 13.5px; color: var(--ink-2); font-weight: 600; }
.empty-sub { margin: 5px 0 14px; font-size: 11.5px; color: var(--muted); line-height: 1.6; }
.empty-chips { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.empty-chips button {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink-2);
  font-size: 11.5px;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all .15s;
}
.empty-chips button:hover { border-color: #c9c0ff; color: var(--accent-ink); background: #faf8ff; }

/* 示例画廊 */
.demo-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 10px;
  overflow-y: auto;
  align-content: start;
}
.demo-item {
  position: relative; padding: 0; border: 1px solid transparent; border-radius: 10px;
  overflow: hidden; cursor: pointer; background: #ecebe7; aspect-ratio: 1;
  transition: transform .12s, border-color .12s;
}
.demo-item:hover { transform: translateY(-2px); border-color: var(--accent); }
.demo-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.demo-cap {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 11px; color: #fff;
  padding: 10px 4px 4px; text-align: center;
  background: linear-gradient(transparent, rgba(0, 0, 0, .72));
}

/* 人脸框 */
.facebox {
  position: absolute;
  border: 2px solid #8f7bff;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(20, 20, 20, .08);
  pointer-events: none;
  transition: all .18s ease;
}
.facebox::after {
  content: 'face';
  position: absolute;
  top: -19px; left: -2px;
  font-size: 10px; letter-spacing: .04em;
  background: #8f7bff; color: #fff;
  padding: 1px 6px; border-radius: 4px;
}

/* 舞台底部信息 */
.stage-foot {
  position: absolute; left: 10px; bottom: 8px; right: 10px;
  display: flex; align-items: center; justify-content: flex-end;
  gap: 8px;
  font-size: 11px; color: var(--muted);
  pointer-events: none;
}
.stage-foot .count { display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, .82); border-radius: 999px; padding: 3px 9px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #cfcdc7; }
.dot.live { background: var(--ok); box-shadow: 0 0 0 3px rgba(47, 163, 107, .15); }
.scanning { background: rgba(255, 255, 255, .82); border-radius: 999px; padding: 3px 9px; color: var(--accent-ink); }
.drop-hint {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: var(--accent-ink); background: rgba(239, 234, 255, .6);
}

/* 操作条 */
.bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bar .grow { flex: 1; }
.btn {
  border-radius: 9px; font-size: 12.5px; padding: 8px 14px; cursor: pointer;
  border: 1px solid var(--line); background: #fff; color: var(--ink-2);
  transition: all .15s;
}
.btn:hover:not(:disabled) { border-color: #d5d2cb; }
.btn.dark { background: var(--dark); border-color: var(--dark); color: #fff; font-weight: 550; }
.btn.dark:hover { background: #000; }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover:not(:disabled) { background: #f4f3ef; color: var(--ink-2); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.fname { font-size: 11.5px; color: var(--muted-2); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 参数行 */
.tune {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding-top: 11px; border-top: 1px dashed var(--line-soft);
}
.tune-label { font-size: 11.5px; color: var(--muted); }
.slider {
  -webkit-appearance: none; appearance: none;
  width: 132px; height: 3px; border-radius: 999px; background: #e6e4df; outline: none;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
  background: #fff; border: 2px solid var(--accent); cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .18);
}
.tune-val { font-size: 11.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.tune-meta { font-size: 11px; color: var(--muted-2); }
.switch { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--muted); cursor: pointer; }
.switch input { accent-color: var(--accent); }

.err { margin: 0; font-size: 11.5px; color: var(--danger); }
</style>
