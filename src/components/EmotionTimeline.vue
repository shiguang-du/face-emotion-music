<template>
  <div class="tl">
    <canvas ref="canvasEl" class="cv"></canvas>
    <div v-if="!points.length" class="hint">未采集画面，这里会显示最近 60 秒的情绪波动</div>
    <div class="axis">
      <span>−60s</span>
      <span>−45s</span>
      <span>−30s</span>
      <span>−15s</span>
      <span>now</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  // [{ t: 时间戳, v: -1~1 的情绪效价 }]
  points: { type: Array, default: () => [] },
  windowSec: { type: Number, default: 60 }
})

const canvasEl = ref(null)
let ro = null

function draw() {
  const c = canvasEl.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  if (!w || !h) return
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const padT = 10
  const padB = 4
  const plotH = h - padT - padB
  const yOf = (v) => padT + (1 - (v + 1) / 2) * plotH

  // 网格：-1 / -0.5 / 0 / +0.5 / +1
  ctx.strokeStyle = '#efece6'
  ctx.lineWidth = 1
  ;[-1, -0.5, 0, 0.5, 1].forEach((v) => {
    const y = Math.round(yOf(v)) + 0.5
    ctx.beginPath()
    ctx.setLineDash(v === 0 ? [] : [3, 4])
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  })
  ctx.setLineDash([])

  // 刻度文字
  ctx.fillStyle = '#c3c2bc'
  ctx.font = '9px Inter, sans-serif'
  ctx.textAlign = 'left'
  ;[[1, '+1'], [0, '0'], [-1, '−1']].forEach(([v, label]) => {
    ctx.fillText(label, 2, yOf(v) + (v === 1 ? 8 : -3))
  })

  const pts = props.points
  if (!pts.length) return

  const now = Date.now()
  const span = props.windowSec * 1000
  const xOf = (t) => w - ((now - t) / span) * w

  const visible = pts.filter((p) => now - p.t <= span)
  if (!visible.length) return

  // 面积渐变
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH)
  grad.addColorStop(0, 'rgba(108, 92, 231, .22)')
  grad.addColorStop(1, 'rgba(108, 92, 231, 0)')

  ctx.beginPath()
  ctx.moveTo(xOf(visible[0].t), yOf(visible[0].v))
  visible.forEach((p) => ctx.lineTo(xOf(p.t), yOf(p.v)))
  const lastX = xOf(visible[visible.length - 1].t)
  ctx.lineTo(lastX, yOf(-1))
  ctx.lineTo(xOf(visible[0].t), yOf(-1))
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // 折线
  ctx.beginPath()
  ctx.moveTo(xOf(visible[0].t), yOf(visible[0].v))
  visible.forEach((p) => ctx.lineTo(xOf(p.t), yOf(p.v)))
  ctx.strokeStyle = '#6c5ce7'
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // 末端光点
  const last = visible[visible.length - 1]
  ctx.beginPath()
  ctx.arc(xOf(last.t), yOf(last.v), 3, 0, Math.PI * 2)
  ctx.fillStyle = '#6c5ce7'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(xOf(last.t), yOf(last.v), 6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(108, 92, 231, .16)'
  ctx.fill()
}

let raf = null
function scheduleDraw() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = null
    draw()
  })
}

watch(() => props.points.length, scheduleDraw)
// 时间轴持续前进：即使没有新数据，线也要向左滑动
let ticker = null

onMounted(() => {
  draw()
  ro = new ResizeObserver(scheduleDraw)
  if (canvasEl.value) ro.observe(canvasEl.value)
  ticker = setInterval(() => {
    if (props.points.length) scheduleDraw()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ro) ro.disconnect()
  if (ticker) clearInterval(ticker)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<style scoped>
.tl { position: relative; height: 92px; padding: 0 14px 4px; }
.cv { width: 100%; height: 74px; display: block; }
.hint {
  position: absolute; inset: 0 14px 14px 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; color: var(--muted-2); pointer-events: none;
}
.axis {
  display: flex; justify-content: space-between;
  font-size: 9.5px; color: #c6c5bf; padding: 0 2px;
}
</style>
