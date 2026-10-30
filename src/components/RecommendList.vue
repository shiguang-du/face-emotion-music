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

    <!-- 双路来源汇总 -->
    <div class="sources">
      <span class="src">
        <b>{{ onlineStatus === 'ok' ? onlineList.length : 0 }}</b> 首在线
      </span>
      <span class="dot">·</span>
      <span class="src"><b>{{ localList.length }}</b> 首离线</span>
    </div>

    <!-- ① 在线推荐：在线音乐接口，实时解析直链 -->
    <section class="sec">
      <h3>
        <span class="tag online">🌐 在线</span>
        在线推荐
        <small v-if="onlineStatus === 'ok'">{{ onlineList.length }} 首 · 在线音乐接口</small>
        <small v-else-if="onlineStatus === 'loading'">正在搜索…</small>
      </h3>

      <div v-if="onlineStatus === 'loading'" class="online-state loading">
        <span class="spinner"></span>
        正在连接在线音乐接口（失败会自动保留离线歌单）
      </div>

      <div v-else-if="onlineStatus === 'empty'" class="online-state empty">
        <div>
          在线接口暂时不可用{{ onlineKeyword ? `（关键词「${onlineKeyword}」）` : '' }}，
          <b>离线歌单仍然可用</b>。
        </div>
        <button class="retry" @click="$emit('retry-online')">↻ 重试在线</button>
      </div>

      <ul v-else-if="onlineList.length">
        <li
          v-for="s in onlineList"
          :key="s.id"
          :class="{ playing: s.id === currentId }"
          @click="$emit('play', s)"
        >
          <span class="cover online">
            <span v-if="!s.cover || failedCovers[s.id]" class="ph">🌐</span>
            <img
              v-else
              :src="s.cover"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="markCoverFailed(s.id)"
            />
          </span>
          <div class="meta">
            <div class="title">{{ s.title }}</div>
            <div class="sub">{{ s.artist }}<template v-if="s.album"> · {{ s.album }}</template></div>
            <div class="sub reason">{{ s.reason }}</div>
          </div>
          <div class="score">
            <div class="num">{{ s.score }}</div>
            <div class="cap">匹配分</div>
          </div>
          <button class="play" @click.stop="$emit('play', s)">▶</button>
        </li>
      </ul>
    </section>

    <!-- ② 离线推荐：本地曲库，断网可用 -->
    <section v-if="localList.length" class="sec">
      <h3>
        <span class="tag offline">💾 离线</span>
        本地曲库推荐
        <small>{{ localList.length }} 首 · 断网可用</small>
      </h3>
      <ul>
        <li
          v-for="s in localList"
          :key="s.id"
          :class="{ playing: s.id === currentId }"
          @click="$emit('play', s)"
        >
          <span class="cover local" :style="grad(s)">{{ s.title.slice(0, 1) }}</span>
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

    <p v-if="!loading && !localList.length && onlineStatus !== 'ok'" class="none">
      识别到情绪后将自动推荐歌曲（离线曲库 + 在线接口）。
    </p>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { STRATEGIES } from '../services/strategy.js'

const props = defineProps({
  localList: { type: Array, default: () => [] },
  onlineList: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  currentId: { type: String, default: '' },
  strategy: { type: String, default: 'auto' },
  resolvedMode: { type: String, default: '' },
  onlineStatus: { type: String, default: 'idle' },
  onlineKeyword: { type: String, default: '' }
})
defineEmits(['play', 'strategy-change', 'retry-online'])

const strategies = STRATEGIES
const activeDesc = computed(() => strategies.find((s) => s.key === props.strategy)?.desc || '')

// 在线封面可能失效/防盗链：按 id 记录失败，回退到 🌐 占位
const failedCovers = reactive({})
function markCoverFailed(id) {
  failedCovers[id] = true
}
watch(
  () => props.onlineList,
  () => {
    Object.keys(failedCovers).forEach((k) => delete failedCovers[k])
  }
)

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

.sources { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #8b93a7; }
.sources b { color: #2d3748; font-size: 13px; }
.sources .dot { color: #cfd6e4; }

.sec h3 {
  display: flex; align-items: center; gap: 6px;
  font-size: 15px; margin: 0 0 10px; color: #2d3748;
}
.sec h3 small { font-weight: 400; color: #8b93a7; font-size: 12px; margin-left: 2px; }
.tag {
  font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 7px; line-height: 1;
}
.tag.offline { background: #eefaf3; color: #1f9d63; border: 1px solid #c9eeda; }
.tag.online { background: #eef3ff; color: #3b6cf6; border: 1px solid #d3e0ff; }

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
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  font-weight: 700; font-size: 18px; color: #fff; object-fit: cover;
}
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover.online { background: linear-gradient(135deg,#222,#555); font-size: 16px; }
.cover .ph { font-size: 18px; }
.meta { flex: 1; min-width: 0; }
.meta .title { font-size: 14px; color: #2d3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .sub { font-size: 12px; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .sub.reason { color: #a6aebf; font-size: 11.5px; }
.score { text-align: center; color: #3b6cf6; }
.score .num { font-size: 18px; font-weight: 700; }
.score .cap { font-size: 11px; color: #8b93a7; }
.play {
  width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
  background: #3b6cf6; color: #fff; font-size: 14px; flex: 0 0 36px;
}
.online-state {
  font-size: 12.5px; line-height: 1.7; padding: 12px 14px; border-radius: 12px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.online-state.loading { background: #f6f9ff; color: #5b8def; border: 1px dashed #d6e2ff; }
.online-state.empty { background: #fbfbfc; color: #7a8296; border: 1px dashed #e3e8f2; }
.online-state.empty b { color: #2d3748; }
.retry {
  border: 1px solid #c9d6ff; background: #fff; color: #3b6cf6;
  padding: 5px 12px; border-radius: 8px; cursor: pointer; font-size: 12.5px;
}
.retry:hover { background: #f3f7ff; }
.spinner {
  width: 14px; height: 14px; border-radius: 50%; display: inline-block;
  border: 2px solid #d6e2ff; border-top-color: #3b6cf6; animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.none { color: #8b93a7; font-size: 14px; }
</style>
