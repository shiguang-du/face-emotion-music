<template>
  <div class="dock" role="region" aria-label="播放器">
    <!-- 封面 + 曲目信息 -->
    <div class="track">
      <span class="cover">
        <img v-if="song.cover" :src="assetUrl(song.cover)" alt="" referrerpolicy="no-referrer" />
        <span v-else>{{ song.title.slice(0, 1) }}</span>
      </span>
      <div class="meta">
        <div class="title" :title="song.title">{{ song.title }}</div>
        <div class="sub" :title="subtitle">{{ subtitle }}</div>
        <div v-if="errMsg" class="err">{{ errMsg }}</div>
      </div>
    </div>

    <!-- 播放控制 -->
    <div class="controls">
      <button class="ico" title="上一首" @click="$emit('prev')">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="2.2" height="14" rx="1.1" />
          <path d="M19.2 6.3v11.4a.7.7 0 0 1-1.09.59l-7.4-5.7a.7.7 0 0 1 0-1.18l7.4-5.7a.7.7 0 0 1 1.09.59z" />
        </svg>
      </button>
      <button class="main" :title="playing ? '暂停' : '播放'" @click="toggle">
        <svg v-if="!playing" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.6v12.8a.7.7 0 0 0 1.07.6l10.1-6.4a.7.7 0 0 0 0-1.2L9.07 5a.7.7 0 0 0-1.07.6z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="5" width="3.6" height="14" rx="1.3" />
          <rect x="13.4" y="5" width="3.6" height="14" rx="1.3" />
        </svg>
      </button>
      <button class="ico" title="下一首" @click="$emit('next')">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="15.8" y="5" width="2.2" height="14" rx="1.1" />
          <path d="M4.8 6.3v11.4a.7.7 0 0 0 1.09.59l7.4-5.7a.7.7 0 0 0 0-1.18l-7.4-5.7a.7.7 0 0 0-1.09.59z" />
        </svg>
      </button>
    </div>

    <!-- 进度 -->
    <span class="time now">{{ fmt(current) }}</span>
    <div class="bar" @click="seek">
      <div class="fill" :style="{ width: progress + '%' }">
        <span class="knob"></span>
      </div>
    </div>
    <span class="time total">{{ fmt(duration) }}</span>

    <!-- 音量 -->
    <div class="volume">
      <button class="ico vol" :title="muted ? '取消静音' : '静音'" @click="toggleMute">
        <svg v-if="muted || volume === 0" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" />
          <path d="M16.5 9.5l4 5M20.5 9.5l-4 5" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" />
          <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
          <path d="M17.9 6.8a7.3 7.3 0 0 1 0 10.4" />
        </svg>
      </button>
      <input
        class="vol-range"
        type="range"
        min="0"
        max="100"
        :value="Math.round(volume * 100)"
        @input="setVolume($event.target.value)"
        aria-label="音量"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { assetUrl } from '../services/asset.js'
import { resolveStreamUrl } from '../services/onlineMusicApi.js'

const props = defineProps({
  song: { type: Object, required: true }
})
const emit = defineEmits(['prev', 'next'])

const audio = ref(null)
const playing = ref(false)
const current = ref(0)
const duration = ref(0)
const volume = ref(0.9)
const muted = ref(false)
const errMsg = ref('')

const progress = ref(0)

const subtitle = ref('')

function fmt(sec) {
  if (!sec || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function ensureAudio() {
  if (!audio.value) {
    const a = new Audio()
    a.volume = volume.value
    a.addEventListener('timeupdate', () => {
      current.value = a.currentTime || 0
      duration.value = a.duration || 0
      progress.value = a.duration ? (a.currentTime / a.duration) * 100 : 0
    })
    a.addEventListener('loadedmetadata', () => {
      duration.value = a.duration || 0
    })
    a.addEventListener('ended', () => {
      playing.value = false
      emit('next')
    })
    a.addEventListener('pause', () => { playing.value = false })
    a.addEventListener('play', () => { playing.value = true })
    a.addEventListener('error', onAudioError)
    audio.value = a
  }
  return audio.value
}

// 在线直链会过期：播放失败时重新解析一次；本地文件给出明确提示
async function onAudioError() {
  const a = audio.value
  if (!a || !props.song || !a.src) return
  playing.value = false
  const s = props.song
  if (s.source === 'online') {
    errMsg.value = '在线直链可能已过期，正在重新获取…'
    const fresh = await resolveStreamUrl(s)
    if (fresh && fresh !== a.src) {
      a.src = fresh
      a.currentTime = 0
      try {
        await a.play()
        errMsg.value = ''
      } catch {
        errMsg.value = '这首歌暂时无法播放，换一首试试'
      }
      return
    }
    errMsg.value = '这首歌暂时无法播放，换一首试试'
  } else {
    errMsg.value = '本地音频文件读取失败，请检查 public/music'
  }
}

watch(
  () => props.song,
  (s) => {
    if (!s) return
    const a = ensureAudio()
    errMsg.value = ''
    subtitle.value = s.artist ? `${s.artist}${s.reason ? ' · ' + s.reason : ''}` : (s.reason || '')
    a.src = assetUrl(s.url || s.file)
    a.currentTime = 0
    current.value = 0
    progress.value = 0
    duration.value = 0
    a.play().catch((e) => console.warn('播放失败：', e.message))
  },
  { immediate: true }
)

function toggle() {
  const a = ensureAudio()
  if (!a.src) return
  if (a.paused) a.play().catch(() => {})
  else a.pause()
}

function seek(e) {
  const a = ensureAudio()
  if (!a.duration) return
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  a.currentTime = ratio * a.duration
  progress.value = ratio * 100
}

function setVolume(v) {
  const a = ensureAudio()
  const val = Math.min(100, Math.max(0, Number(v))) / 100
  volume.value = val
  a.volume = val
  if (val > 0 && muted.value) {
    muted.value = false
    a.muted = false
  }
}

function toggleMute() {
  const a = ensureAudio()
  muted.value = !muted.value
  a.muted = muted.value
}

onBeforeUnmount(() => {
  if (audio.value) {
    audio.value.pause()
    audio.value = null
  }
})
</script>

<style scoped>
.dock {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(1180px, calc(100% - 32px));
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, .92);
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  backdrop-filter: blur(14px) saturate(1.25);
  color: #2d3748;
  border: 1px solid #e6ecf7;
  box-shadow: 0 10px 30px rgba(56, 80, 130, .13), 0 2px 6px rgba(56, 80, 130, .06);
}

/* 曲目 */
.track { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 0 1 300px; }
.cover {
  width: 42px; height: 42px; border-radius: 10px; flex: 0 0 42px;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: linear-gradient(135deg, #6c5ce7, #9b6ef3);
  color: #fff; font-size: 17px; font-weight: 700;
  box-shadow: 0 3px 10px rgba(108, 92, 231, .22);
}
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.meta { min-width: 0; }
.meta .title { font-size: 13.5px; font-weight: 600; color: #2d3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .sub { font-size: 11.5px; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.meta .err { font-size: 11px; color: #e55039; margin-top: 2px; }

/* 控制 */
.controls { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.ico {
  width: 30px; height: 30px; border: none; background: transparent; color: #6b7a90;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;
  transition: color .15s, background .15s;
}
.ico:hover { color: #3b6cf6; background: #eef3fd; }
.ico svg { width: 16px; height: 16px; fill: currentColor; }
.vol svg path:not(:first-child) {
  fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round;
}
.main {
  width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
  background: linear-gradient(135deg, #3b6cf6, #6c5ce7); color: #fff; margin: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(70, 96, 220, .32);
  transition: transform .15s, box-shadow .15s;
}
.main svg { width: 16px; height: 16px; fill: currentColor; }
.main:hover { transform: scale(1.05); box-shadow: 0 6px 16px rgba(70, 96, 220, .4); }

/* 进度 */
.time { font-size: 11.5px; color: #8b93a7; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.bar {
  flex: 1 1 auto; height: 4px; border-radius: 999px; background: #e6ecf5;
  position: relative; cursor: pointer; margin: 0 2px;
}
.bar:hover { background: #d9e2f0; }
.fill {
  position: relative; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #3b6cf6, #8e6ff0);
  transition: width .12s linear;
}
.knob {
  position: absolute; right: -4px; top: 50%; transform: translateY(-50%);
  width: 9px; height: 9px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 0 2.5px #6c5ce7, 0 2px 6px rgba(80, 70, 160, .3);
}

/* 音量 */
.volume { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.vol-range {
  width: 74px; accent-color: #6c5ce7; cursor: pointer; height: 4px;
}

@media (max-width: 860px) {
  .dock { gap: 10px; padding: 9px 12px; bottom: 10px; }
  .track { flex-basis: 170px; }
  .volume { display: none; }
  .meta .sub { display: none; }
}
@media (max-width: 620px) {
  .track { flex-basis: 120px; }
  .time.total { display: none; }
}
</style>
