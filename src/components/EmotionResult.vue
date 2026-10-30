<template>
  <div class="er">
    <template v-if="dominant">
      <!-- 主导情绪 -->
      <div class="hero">
        <div class="face" :style="{ background: emotion.color + '1f', color: emotion.color }">
          {{ emotion.emoji }}
        </div>
        <div class="hmeta">
          <div class="hk">主导情绪</div>
          <div class="hv">
            <span :style="{ color: emotion.color }">{{ emotion.label }}</span>
            <span class="hprob">{{ pct(expressions[dominant]) }}%</span>
          </div>
          <div class="hs">{{ framesText }} · 效价 {{ signed.toFixed(2) }}</div>
        </div>
        <div class="hval" :class="{ pos: signed >= 0 }">
          {{ signed >= 0 ? '积极' : '消极' }}
        </div>
      </div>

      <!-- 7 类概率 -->
      <div class="bars">
        <div v-for="e in sorted" :key="e.key" class="row">
          <span class="k">{{ EMOTIONS[e.key].emoji }} {{ EMOTIONS[e.key].label }}</span>
          <div class="track">
            <div class="fill" :style="{ width: Math.max(e.pct, 2) + '%', background: EMOTIONS[e.key].color }"></div>
          </div>
          <span class="v">{{ e.pct }}%</span>
        </div>
      </div>
    </template>

    <!-- 空态 -->
    <div v-else class="empty">
      <div class="empty-ico">🙂</div>
      <p class="empty-title">{{ loading ? '正在加载本地识别模型…' : '还没有识别结果' }}</p>
      <p class="empty-sub">{{ loading ? '模型权重约 0.5MB，首次加载稍慢' : '上传图片 / 视频帧 / 摄像头 识别后开始' }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { EMOTIONS } from '../services/emotionProfile.js'

const props = defineProps({
  expressions: { type: Object, default: () => ({}) },
  dominant: { type: String, default: '' },
  frames: { type: Number, default: 0 },
  windowSize: { type: Number, default: 5 },
  loading: { type: Boolean, default: false }
})

const emotion = computed(() => EMOTIONS[props.dominant] || EMOTIONS.neutral)

const framesText = computed(() =>
  props.frames > 1 ? `${props.frames} 帧 · 滑动窗口 ${props.windowSize} 帧融合` : '单帧识别'
)

// 连续效价：把 7 类概率加权成一个 -1~1 的"情绪正负向"分数
const signed = computed(() => {
  const x = props.expressions || {}
  const v =
    1.0 * (x.happy || 0) +
    0.55 * (x.surprised || 0) +
    0.1 * (x.neutral || 0) -
    0.6 * (x.sad || 0) -
    0.8 * (x.angry || 0) -
    0.5 * (x.fearful || 0) -
    0.4 * (x.disgusted || 0)
  return Math.max(-1, Math.min(1, v))
})

const sorted = computed(() =>
  Object.keys(props.expressions)
    .map((key) => ({ key, pct: Math.round((props.expressions[key] || 0) * 100) }))
    .sort((a, b) => b.pct - a.pct)
)

function pct(v) {
  return Math.round((v || 0) * 100)
}
</script>

<style scoped>
.er { display: flex; flex-direction: column; gap: 14px; padding: 0 14px 14px; }

.hero {
  display: flex; align-items: center; gap: 12px;
  background: #faf9f6; border: 1px solid var(--line-soft);
  border-radius: 12px; padding: 12px;
}
.face {
  width: 46px; height: 46px; border-radius: 12px; flex: 0 0 46px;
  display: flex; align-items: center; justify-content: center; font-size: 24px;
}
.hmeta { min-width: 0; flex: 1; }
.hk { font-size: 10.5px; color: var(--muted); letter-spacing: .04em; }
.hv { display: flex; align-items: baseline; gap: 8px; font-size: 19px; font-weight: 700; line-height: 1.25; }
.hprob { font-size: 12px; font-weight: 500; color: var(--muted); }
.hs { font-size: 11px; color: var(--muted-2); margin-top: 2px; }
.hval {
  font-size: 11px; padding: 3px 9px; border-radius: 999px;
  background: #f1f0ec; color: var(--muted); align-self: flex-start;
}
.hval.pos { background: #eaf7f0; color: var(--ok); }

.bars { display: flex; flex-direction: column; gap: 7px; }
.row { display: grid; grid-template-columns: 74px 1fr 38px; align-items: center; gap: 8px; font-size: 11.5px; }
.k { color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { height: 6px; background: #f1f0ec; border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; transition: width .35s ease; }
.v { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

.empty { text-align: center; padding: 26px 12px 22px; }
.empty-ico {
  width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 50%;
  background: #f4f3ef; display: flex; align-items: center; justify-content: center; font-size: 24px;
  opacity: .85;
}
.empty-title { margin: 0; font-size: 13px; color: var(--ink-2); font-weight: 600; }
.empty-sub { margin: 5px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.6; }
</style>
