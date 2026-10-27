<template>
  <div class="rec">
    <!-- 推荐策略（S1 目标决策） -->
    <div class="strategy">
      <div class="strategy-row">
        <span class="strategy-label">推荐策略</span>
        <div class="pills">
          <button
            v-for="s in strategies"
            :key="s.key"
            class="pill"
            :class="{ active: strategy === s.key }"
            @click="$emit('strategy-change', s.key)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <p class="strategy-desc">{{ activeDesc }}</p>
      <p v-if="resolvedMode" class="strategy-resolved">
        实际生效：{{ resolvedMode === 'repair' ? '情绪修复' : '同频镜像' }}
      </p>
    </div>

    <div v-if="loading" class="loading">🎵 正在为你推荐歌曲…</div>

    <section v-if="localList.length">
      <h3>💾 本地曲库推荐 <small>离线可用 · 按情绪特征打分</small></h3>
      <ul>
        <li v-for="s in localList" :key="s.id" :class="{ playing: s.id === currentId }" @click="$emit('play', s)">
          <span class="cover" :style="grad(s)">{{ s.title.slice(0, 1) }}</span>
          <div class="meta">
            <div class="title">{{ s.title }}</div>
            <div class="sub">{{ s.artist }} · {{ s.reason }}</div>
          </div>
          <div class="score">
            <div class="num">{{ s.score }}</div>
            <div class="cap">匹配分</div>
          </div>
          <button class="play" @click.stop="$emit('play', s)">▶</button>
        </li>
      </ul>
    </section>

    <section v-if="onlineList.length">
      <h3>🌐 在线歌曲推荐 <small>来自在线音乐接口</small></h3>
      <ul>
        <li v-for="s in onlineList" :key="s.id" :class="{ playing: s.id === currentId }" @click="$emit('play', s)">
          <img v-if="s.cover" class="cover" :src="s.cover" alt="" />
          <span v-else class="cover online">🌐</span>
          <div class="meta">
            <div class="title">{{ s.title }}</div>
            <div class="sub">{{ s.artist }} · {{ s.reason }}</div>
          </div>
          <button class="play" @click.stop="$emit('play', s)">▶</button>
        </li>
      </ul>
    </section>

    <p v-if="!loading && !localList.length && !onlineList.length" class="none">
      识别到情绪后将自动推荐歌曲。
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { STRATEGIES } from '../services/strategy.js'

const props = defineProps({
  localList: { type: Array, default: () => [] },
  onlineList: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  currentId: { type: String, default: '' },
  strategy: { type: String, default: 'auto' },
  resolvedMode: { type: String, default: '' }
})
defineEmits(['play', 'strategy-change'])

const strategies = STRATEGIES
const activeDesc = computed(() => strategies.find((s) => s.key === props.strategy)?.desc || '')

const palettes = [
  'linear-gradient(135deg,#3b6cf6,#6f9bff)',
  'linear-gradient(135deg,#f7b500,#ffd35c)',
  'linear-gradient(135deg,#e55039,#ff8a73)',
  'linear-gradient(135deg,#5b8def,#9ec1ff)',
  'linear-gradient(135deg,#26de81,#7bed9f)',
  'linear-gradient(135deg,#8854d0,#b58bff)'
]
function grad(s) {
  const i = Math.abs(hash(s.id)) % palettes.length
  return { background: palettes[i], color: '#fff' }
}
function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return h
}
</script>

<style scoped>
.rec { display: flex; flex-direction: column; gap: 16px; }
.strategy { border-bottom: 1px dashed #e6eaf2; padding-bottom: 12px; }
.strategy-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.strategy-label { font-size: 13px; color: #6b7280; }
.pills { display: flex; gap: 8px; flex-wrap: wrap; }
.pill {
  border: 1px solid #e2e6f0; background: #fff; color: #4a5568;
  padding: 6px 14px; border-radius: 999px; cursor: pointer; font-size: 13px;
  transition: all .15s;
}
.pill:hover { border-color: #c7d2fe; color: #5b5bd6; }
.pill.active { background: #eef2ff; color: #5b5bd6; border-color: #c7d2fe; font-weight: 600; }
.strategy-desc { margin: 8px 0 0; font-size: 12.5px; color: #7a8296; line-height: 1.6; }
.strategy-resolved { margin: 4px 0 0; font-size: 12px; color: #5b8def; }
.loading { color: #5b8def; font-size: 14px; padding: 8px 0; }
section h3 { font-size: 15px; margin: 0 0 10px; color: #2d3748; }
section h3 small { font-weight: 400; color: #8b93a7; font-size: 12px; margin-left: 6px; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
li {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  background: #fff; border: 1px solid #eef1f6; border-radius: 12px; cursor: pointer;
  transition: all .15s;
}
li:hover { border-color: #c9d6ff; box-shadow: 0 4px 14px rgba(59,108,246,.08); }
li.playing { border-color: #3b6cf6; background: #f3f7ff; }
.cover {
  width: 44px; height: 44px; border-radius: 10px; flex: 0 0 44px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 18px; color: #fff; object-fit: cover;
}
.cover.online { background: linear-gradient(135deg,#222,#555); }
.meta { flex: 1; min-width: 0; }
.meta .title { font-size: 14px; color: #2d3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .sub { font-size: 12px; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.score { text-align: center; color: #3b6cf6; }
.score .num { font-size: 18px; font-weight: 700; }
.score .cap { font-size: 11px; color: #8b93a7; }
.play {
  width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
  background: #3b6cf6; color: #fff; font-size: 14px; flex: 0 0 36px;
}
.none { color: #8b93a7; font-size: 14px; }
</style>
