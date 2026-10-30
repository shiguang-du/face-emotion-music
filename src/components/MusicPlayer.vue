<template>
  <div class="player">
    <!-- 封面 + 曲目 -->
    <div class="left">
      <img v-if="song?.cover" class="cover" :src="assetUrl(song.cover)" alt="" />
      <span v-else class="cover" :class="{ empty: !song }">
        {{ song ? song.title.slice(0, 1) : '♪' }}
      </span>
      <div class="meta">
        <div class="t">{{ song ? song.title : '未在播放' }}</div>
        <div class="s">{{ song ? (song.artist + ' · ' + (song.reason || '情绪匹配')) : hint }}</div>
      </div>
    </div>

    <!-- 控制 -->
    <div class="center">
      <button class="ico" :disabled="!queueLen" title="上一首" @click="$emit('prev')">⏮</button>
      <button class="main" :disabled="!song" @click="toggle">{{ playing ? '❚❚' : '▶' }}</button>
      <button class="ico" :disabled="!queueLen" title="下一首" @click="$emit('next')">⏭</button>
    </div>

    <!-- 进度 -->
    <div class="progress">
      <span class="time">{{ fmt(currentTime) }}</span>
      <div class="track" @click="seek">
        <div class="fill" :style="{ width: progress + '%' }"></div>
        <span class="knob" :style="{ left: progress + '%' }"></span>
      </div>
      <span class="time">{{ fmt(duration) }}</span>
    </div>

    <!-- 音量 -->
    <div class="vol">
      <span class="vico">{{ volume === 0 ? '🔇' : '🔊' }}</span>
      <input
        class="vslider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="volume"
        @input="setVolume(Number($event.target.value))"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { assetUrl } from '../services/asset.js'

const props = defineProps({
  song: { type: Object, default: null },
  hint: { type: String, default: '识别情绪并稳定 3 秒后自动播放' },
  queueLen: { type: Number, default: 0 }
})
const emit = defineEmits(['prev', 'next'])

const audio = ref(null)
const playing = ref(false)
const progress = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.8)

onMounted(() => {
  const a = new Audio()
  a.preload = 'metadata'
  a.volume = volume.value
  a.addEventListener('timeupdate', () => {
    currentTime.value = a.currentTime || 0
    if (a.duration) progress.value = (a.currentTime / a.duration) * 100
  })
  a.addEventListener('loadedmetadata', () => { duration.value = a.duration || 0 })
  a.addEventListener('ended', () => {
    playing.value = false
    emit('next')
  })
  a.addEventListener('pause', () => { playing.value = false })
  a.addEventListener('play', () => { playing.value = true })
  audio.value = a
})

watch(
  () => props.song,
  (s) => {
    if (!s || !audio.value) return
    const a = audio.value
    // 本地曲库里的 file 形如 "/music/song-1.mp3"，必须按部署基路径解析，否则子路径部署 404
    a.src = assetUrl(s.url || s.file)
    a.currentTime = 0
    progress.value = 0
    currentTime.value = 0
    duration.value = 0
    a.play().catch((e) => console.warn('播放失败：', e.message))
  }
)

function toggle() {
  const a = audio.value
  if (!a || !a.src) return
  if (a.paused) a.play().catch(() => {})
  else a.pause()
}

function seek(e) {
  const a = audio.value
  if (!a || !a.duration) return
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  a.currentTime = ratio * a.duration
}

function setVolume(v) {
  volume.value = v
  if (audio.value) audio.value.volume = v
}

function fmt(sec) {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  if (audio.value) {
    audio.value.pause()
    audio.value.src = ''
    audio.value = null
  }
})
</script>

<style scoped>
.player {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(220px, 1.1fr) 90px;
  align-items: center;
  gap: 16px;
  background: var(--dark);
  border-radius: 14px;
  padding: 10px 14px;
  color: #fff;
}

.left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cover {
  width: 38px; height: 38px; border-radius: 9px; flex: 0 0 38px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #6c5ce7, #a796ff);
  font-size: 15px; font-weight: 700; color: #fff; object-fit: cover;
}
.cover.empty { background: #2b2c30; color: #6a6b70; }
.meta { min-width: 0; }
.meta .t { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .s { font-size: 10.5px; color: #8e8f95; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.center { display: flex; align-items: center; gap: 10px; }
.ico {
  width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
  background: transparent; color: #b8b9bf; font-size: 11px;
  display: flex; align-items: center; justify-content: center;
}
.ico:hover:not(:disabled) { background: #2b2c30; color: #fff; }
.ico:disabled { opacity: .3; cursor: not-allowed; }
.main {
  width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
  background: #fff; color: #17181a; font-size: 11px;
  display: flex; align-items: center; justify-content: center;
}
.main:disabled { opacity: .35; cursor: not-allowed; }
.main:hover:not(:disabled) { transform: scale(1.04); }

.progress { display: flex; align-items: center; gap: 8px; }
.time { font-size: 10px; color: #8e8f95; font-variant-numeric: tabular-nums; min-width: 30px; text-align: center; }
.track {
  position: relative; flex: 1; height: 3px; border-radius: 999px;
  background: #34353a; cursor: pointer;
}
.fill { height: 100%; border-radius: 999px; background: #fff; transition: width .2s linear; }
.knob {
  position: absolute; top: 50%; width: 7px; height: 7px; border-radius: 50%;
  background: #fff; transform: translate(-50%, -50%); transition: left .2s linear;
}

.vol { display: flex; align-items: center; gap: 6px; }
.vico { font-size: 11px; opacity: .7; }
.vslider {
  -webkit-appearance: none; appearance: none;
  width: 58px; height: 3px; border-radius: 999px; background: #34353a; outline: none;
}
.vslider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 9px; height: 9px; border-radius: 50%;
  background: #fff; cursor: pointer;
}

@media (max-width: 900px) {
  .player { grid-template-columns: 1fr auto; grid-template-areas: 'left center' 'progress progress'; row-gap: 8px; }
  .left { grid-area: left; }
  .center { grid-area: center; }
  .progress { grid-area: progress; }
  .vol { display: none; }
}
</style>
