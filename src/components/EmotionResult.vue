<template>
  <div class="result" v-if="dominant">
    <div class="hero" :style="{ background: emotion.color + '22', borderColor: emotion.color }">
      <span class="emoji">{{ emotion.emoji }}</span>
      <div>
        <div class="label">识别情绪</div>
        <div class="big" :style="{ color: emotion.color }">{{ emotion.label }}</div>
        <div class="prob">主导概率 {{ Math.round((expressions[dominant] || 0) * 100) }}%</div>
      </div>
    </div>

    <div class="bars">
      <div class="bar-row" v-for="e in sortedList" :key="e.key">
        <span class="name">{{ EMOTIONS[e.key].emoji }} {{ EMOTIONS[e.key].label }}</span>
        <div class="track">
          <div class="fill" :style="{ width: e.pct + '%', background: EMOTIONS[e.key].color }"></div>
        </div>
        <span class="pct">{{ e.pct }}%</span>
      </div>
    </div>
  </div>
  <div class="empty" v-else>尚未识别到人脸，请先通过上方方式获取人脸。</div>
</template>

<script setup>
import { computed } from 'vue'
import { EMOTIONS } from '../services/emotionProfile.js'

const props = defineProps({
  expressions: { type: Object, default: () => ({}) },
  dominant: { type: String, default: '' }
})

const emotion = computed(() => EMOTIONS[props.dominant] || EMOTIONS.neutral)

const sortedList = computed(() => {
  return Object.keys(props.expressions)
    .map((key) => ({ key, pct: Math.round((props.expressions[key] || 0) * 100) }))
    .sort((a, b) => b.pct - a.pct)
})
</script>

<style scoped>
.result { display: flex; flex-direction: column; gap: 14px; }
.hero {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px;
  border: 1px solid; border-radius: 14px;
}
.hero .emoji { font-size: 44px; line-height: 1; }
.hero .label { font-size: 12px; color: #8b93a7; }
.hero .big { font-size: 30px; font-weight: 700; }
.hero .prob { font-size: 13px; color: #5b6577; }
.bars { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: grid; grid-template-columns: 96px 1fr 44px; align-items: center; gap: 10px; font-size: 13px; }
.name { color: #3a4252; }
.track { height: 10px; background: #eef1f6; border-radius: 6px; overflow: hidden; }
.fill { height: 100%; border-radius: 6px; transition: width .4s ease; }
.pct { text-align: right; color: #5b6577; font-variant-numeric: tabular-nums; }
.empty { color: #8b93a7; font-size: 14px; padding: 20px 0; text-align: center; }
</style>
