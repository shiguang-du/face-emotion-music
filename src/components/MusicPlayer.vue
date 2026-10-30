<template>
  <div class="player" :class="{ active: song }">
    <img v-if="song?.cover" class="pc" :src="assetUrl(song.cover)" alt="" referrerpolicy="no-referrer" />
    <span v-else class="pc">{{ song ? song.title.slice(0, 1) : '♪' }}</span>

    <div class="info">
      <div class="t">{{ song ? song.title : '未在播放' }}</div>
      <div class="a">{{ song ? song.artist : '选择一首推荐歌曲开始播放' }}</div>
      <div v-if="errMsg" class="err">{{ errMsg }}</div>
      <div class="bar" v-if="song && !errMsg">
        <div class="fill" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <button class="ctrl" :disabled="!song" @click="toggle">
      {{ playing ? '⏸' : '▶' }}
    </button>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { assetUrl } from '../services/asset.js'
import { resolveStreamUrl } from '../services/onlineMusicApi.js'

const props = defineProps({
  song: { type: Object, default: null }
})

const audio = ref(null)
const playing = ref(false)
const progress = ref(0)
const errMsg = ref('')

function ensureAudio() {
  if (!audio.value) {
    audio.value = new Audio()
    audio.value.addEventListener('timeupdate', () => {
      if (audio.value.duration) progress.value = (audio.value.currentTime / audio.value.duration) * 100
    })
    audio.value.addEventListener('ended', () => { playing.value = false })
    audio.value.addEventListener('pause', () => { playing.value = false })
    audio.value.addEventListener('play', () => { playing.value = true })
    audio.value.addEventListener('error', onAudioError)
  }
  return audio.value
}

// 播放失败：在线歌曲尝试重新解析直链（网易云直链会过期），本地文件给出明确提示
async function onAudioError() {
  const s = props.song
  const a = audio.value
  if (!s || !a || !a.src) return
  playing.value = false
  progress.value = 0

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
        errMsg.value = '这首歌暂时无法播放（可能无版权/已下架），换一首试试'
      }
      return
    }
    errMsg.value = '这首歌暂时无法播放（可能无版权/已下架），换一首试试'
  } else {
    errMsg.value = '本地音频文件读取失败，请检查 public/music 下的文件是否存在'
  }
}

watch(
  () => props.song,
  (s) => {
    if (!s) return
    const a = ensureAudio()
    errMsg.value = ''
    // 本地曲库的 file 形如 "/music/song-1.mp3"，必须按部署基路径解析，否则子路径部署 404
    a.src = assetUrl(s.url || s.file)
    a.currentTime = 0
    progress.value = 0
    a.play().catch((e) => console.warn('播放失败：', e.message))
  }
)

function toggle() {
  const a = ensureAudio()
  if (!a.src) return
  if (a.paused) a.play().catch(() => {})
  else a.pause()
}

onBeforeUnmount(() => {
  if (audio.value) {
    audio.value.pause()
    audio.value = null
  }
})
</script>

<style scoped>
.player {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: #fff; border: 1px solid #eef1f6; border-radius: 14px;
}
.player.active { border-color: #bcd0ff; box-shadow: 0 6px 20px rgba(59,108,246,.1); }
.pc {
  width: 48px; height: 48px; border-radius: 12px; flex: 0 0 48px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg,#3b6cf6,#6f9bff); color: #fff; font-size: 20px; font-weight: 700;
  object-fit: cover;
}
.info { flex: 1; min-width: 0; }
.info .t { font-size: 15px; color: #2d3748; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.info .a { font-size: 12px; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.info .err { font-size: 11.5px; color: #e55039; margin-top: 3px; }
.bar { height: 5px; background: #eef1f6; border-radius: 4px; margin-top: 6px; overflow: hidden; }
.fill { height: 100%; background: #3b6cf6; transition: width .25s; }
.ctrl {
  width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
  background: #3b6cf6; color: #fff; font-size: 16px; flex: 0 0 44px;
}
.ctrl:disabled { opacity: .4; cursor: not-allowed; }
</style>
