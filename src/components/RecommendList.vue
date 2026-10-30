<template>
  <div class="rec">
    <!-- 推荐策略 -->
    <div class="strategy">
      <div class="pills">
        <button
          v-for="s in strategies"
          :key="s.key"
          class="pill"
          :class="{ on: strategy === s.key }"
          @click="$emit('strategy-change', s.key)"
        >
          <span class="pill-ico">{{ s.icon }}</span>{{ s.label }}
        </button>
        <span v-if="resolvedMode" class="resolved">
          实际生效：{{ resolvedMode === 'repair' ? '情绪修复' : '同频镜像' }}
        </span>
      </div>
      <p class="note">{{ activeDesc }}</p>
    </div>

    <!-- 全部 / 本地 / 在线 -->
    <div class="seg">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="seg-btn"
        :class="{ on: tab === t.key }"
        @click="$emit('update:tab', t.key)"
      >
        {{ t.label }} <b>{{ t.count }}</b>
      </button>
    </div>

    <div v-if="loading" class="loading">
      <span class="spin"></span> 正在按「{{ emotionLabel || '当前情绪' }}」生成歌单…
    </div>

    <!-- 歌单 -->
    <ul v-else-if="list.length" class="list">
      <li
        v-for="(s, i) in list"
        :key="s.id"
        :class="{ playing: s.id === currentId }"
        @click="$emit('play', s)"
      >
        <span class="idx">{{ String(i + 1).padStart(2, '0') }}</span>
        <img v-if="s.cover" class="cover" :src="assetUrl(s.cover)" alt="" />
        <span v-else class="cover grad" :style="grad(s)">{{ s.title.slice(0, 1) }}</span>
        <div class="meta">
          <div class="title">{{ s.title }}</div>
          <div class="sub">{{ s.artist }} · {{ s.reason }}</div>
        </div>
        <span v-if="s.source === 'local'" class="badge score">{{ s.score }}</span>
        <span v-else class="badge online">在线</span>
        <button class="play-btn" @click.stop="$emit('play', s)">
          {{ s.id === currentId ? '❚❚' : '▶' }}
        </button>
      </li>
    </ul>

    <!-- 空态 -->
    <div v-else class="empty">
      <div class="empty-ico">{{ tab === 'online' ? '🌐' : '🎧' }}</div>
      <p class="empty-title">{{ emptyTitle }}</p>
      <p class="empty-sub" v-html="emptySub"></p>
      <button v-if="tab !== 'online'" class="gen" :disabled="!emotionLabel" @click="$emit('regenerate')">
        {{ emotionLabel ? '按当前情绪生成歌单' : '先识别一张人脸' }}
      </button>
    </div>

    <!-- 底栏 -->
    <div class="foot">
      <span>本地曲库 {{ localTotal }} 首 · 在线 {{ onlineCount }} 首</span>
      <button class="head-link" @click="$emit('explain')">推荐算法说明 →</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { STRATEGIES } from '../services/strategy.js'
import { assetUrl } from '../services/asset.js'

const props = defineProps({
  localList: { type: Array, default: () => [] },
  onlineList: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  currentId: { type: String, default: '' },
  strategy: { type: String, default: 'auto' },
  resolvedMode: { type: String, default: '' },
  emotionLabel: { type: String, default: '' },
  tab: { type: String, default: 'all' },
  localTotal: { type: Number, default: 0 }
})
defineEmits(['play', 'strategy-change', 'update:tab', 'regenerate', 'explain'])

const strategies = STRATEGIES
const activeDesc = computed(() => strategies.find((s) => s.key === props.strategy)?.desc || '')
const onlineCount = computed(() => props.onlineList.length)

const emptyTitle = computed(() => {
  if (props.tab === 'online') return onlineCount.value ? '' : '在线歌曲暂未取到'
  return '歌单还没有生成'
})
const emptySub = computed(() => {
  if (props.tab === 'online') return '在线音乐接口不可用时会自动回退本地曲库<br />不影响识别与播放'
  return '识别情绪后会自动生成并播放<br />也可以点击下方按钮手动生成'
})

const tabs = computed(() => [
  { key: 'all', label: '全部', count: props.localList.length + props.onlineList.length },
  { key: 'local', label: '本地', count: props.localList.length },
  { key: 'online', label: '在线', count: props.onlineList.length }
])

const list = computed(() => {
  if (props.tab === 'local') return props.localList
  if (props.tab === 'online') return props.onlineList
  return [...props.localList, ...props.onlineList]
})

const palettes = [
  'linear-gradient(135deg,#6c5ce7,#a796ff)',
  'linear-gradient(135deg,#f0a500,#ffd06b)',
  'linear-gradient(135deg,#e05248,#ff8b7f)',
  'linear-gradient(135deg,#4c8dff,#9ec1ff)',
  'linear-gradient(135deg,#2fa36b,#7cdcaa)',
  'linear-gradient(135deg,#8a4fd8,#c39bff)'
]
function grad(s) {
  const i = Math.abs(hash(String(s.id || s.title))) % palettes.length
  return { background: palettes[i], color: '#fff' }
}
function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return h
}
</script>

<style scoped>
.rec { display: flex; flex-direction: column; gap: 11px; padding: 0 14px 12px; min-height: 0; }

/* 策略 */
.strategy { display: flex; flex-direction: column; gap: 7px; }
.pills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pill {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--line); background: #fff; color: var(--muted);
  font-size: 11.5px; padding: 6px 11px; border-radius: 999px; cursor: pointer;
  transition: all .15s;
}
.pill:hover { border-color: #d7d1f8; color: var(--accent-ink); }
.pill.on {
  background: var(--accent-soft); border-color: #d9d0ff; color: var(--accent-ink); font-weight: 600;
}
.pill-ico { font-size: 11px; opacity: .9; }
.resolved { font-size: 10.5px; color: var(--muted-2); margin-left: 2px; }
.note { margin: 0; font-size: 11px; color: var(--muted); line-height: 1.55; }

/* 分段 */
.seg {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px;
  background: #f4f3ef; border: 1px solid var(--line-soft); border-radius: 10px; padding: 3px;
}
.seg-btn {
  border: none; background: transparent; color: var(--muted); font-size: 11.5px;
  padding: 6px 4px; border-radius: 8px; cursor: pointer; transition: all .15s;
}
.seg-btn b { font-weight: 600; margin-left: 2px; color: var(--muted-2); }
.seg-btn.on { background: #fff; color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(24,24,24,.09); }
.seg-btn.on b { color: var(--accent); }

/* 列表 */
.loading { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--accent-ink); padding: 14px 2px; }
.spin { width: 12px; height: 12px; border: 2px solid #ddd6ff; border-top-color: var(--accent); border-radius: 50%; animation: sp .7s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }

.list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 6px;
  max-height: 330px; overflow-y: auto; padding-right: 2px;
}
li {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 8px; border-radius: 10px; cursor: pointer;
  border: 1px solid transparent; transition: all .15s;
}
li:hover { background: #faf9f6; border-color: var(--line-soft); }
li.playing { background: var(--accent-soft); border-color: #dfd8ff; }
.idx { font-size: 10px; color: var(--muted-2); width: 14px; font-variant-numeric: tabular-nums; }
.cover {
  width: 34px; height: 34px; border-radius: 9px; flex: 0 0 34px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff; object-fit: cover;
}
.meta { flex: 1; min-width: 0; }
.meta .title { font-size: 12.5px; color: var(--ink); font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta .sub { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.badge {
  font-size: 10px; border-radius: 6px; padding: 2px 6px; flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.badge.score { background: #f3f0ff; color: var(--accent-ink); font-weight: 600; }
.badge.online { background: #eef5ff; color: #3773d6; }
.play-btn {
  width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line);
  background: #fff; color: var(--ink-2); font-size: 9px; cursor: pointer; flex: 0 0 26px;
  display: flex; align-items: center; justify-content: center;
}
.play-btn:hover { background: var(--dark); color: #fff; border-color: var(--dark); }

/* 空态 */
.empty { text-align: center; padding: 22px 12px 18px; }
.empty-ico {
  width: 50px; height: 50px; margin: 0 auto 11px; border-radius: 50%;
  background: #f4f3ef; display: flex; align-items: center; justify-content: center; font-size: 22px;
}
.empty-title { margin: 0; font-size: 13px; color: var(--ink-2); font-weight: 600; }
.empty-sub { margin: 5px 0 12px; font-size: 11px; color: var(--muted); line-height: 1.6; }
.gen {
  border: 1px solid var(--line); background: #fff; color: var(--ink-2);
  font-size: 11.5px; padding: 7px 14px; border-radius: 999px; cursor: pointer;
}
.gen:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-ink); }
.gen:disabled { opacity: .5; cursor: not-allowed; }

.foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 9px; border-top: 1px dashed var(--line-soft);
  font-size: 10.5px; color: var(--muted-2);
}
</style>
