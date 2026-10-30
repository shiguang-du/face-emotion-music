<template>
  <transition name="fade">
    <div v-if="open" class="mask" @click.self="$emit('close')">
      <div class="dialog">
        <header class="dh">
          <div>
            <h3>算法说明</h3>
            <p>两套算法全部在浏览器本地运行，无后端调用</p>
          </div>
          <button class="x" @click="$emit('close')">✕</button>
        </header>

        <div class="body">
          <!-- 算法一 -->
          <section>
            <h4><span class="no">01</span>人脸情绪识别</h4>
            <p class="kw">
              引擎 <code>@vladmandic/face-api</code>（TensorFlow.js） · 模型
              <code>tinyFaceDetector</code> + <code>faceExpressionNet</code> · 权重随包发布，可离线
            </p>
            <ol>
              <li>模型初始化：优先 <b>WebGL</b> 后端（GPU 加速），失败自动回退 <b>CPU</b>；加载两个模型的权重。</li>
              <li>人脸检测：<code>tinyFaceDetector</code> 在整帧上回归出人脸框，置信度阈值 = 界面上的「检测灵敏度」。</li>
              <li>表情分类：把框内人脸缩放到模型输入（320×320 / 416×416）后送入 <code>faceExpressionNet</code>，输出 7 类概率。</li>
              <li>多帧融合：维护一个 5 帧滑动窗口，对 7 类概率逐维取均值，抑制单帧抖动后再取 argmax 作为主导情绪。</li>
              <li>连续效价：<code>v = happy + 0.55·surprised + 0.1·neutral − 0.6·sad − 0.8·angry − 0.5·fearful − 0.4·disgusted</code>，值域 −1~1，用于底部情绪轨迹曲线。</li>
            </ol>
            <p class="tip">7 类情绪：平静 neutral · 开心 happy · 悲伤 sad · 愤怒 angry · 恐惧 fearful · 厌恶 disgusted · 惊讶 surprised</p>
          </section>

          <!-- 算法二 -->
          <section>
            <h4><span class="no">02</span>歌曲推荐</h4>
            <p class="kw">
              情绪标签 → 目标画像 → 特征距离打分 + 标签重合 → 多样性重排
            </p>
            <ol>
              <li>画像映射：每种情绪定义目标 <code>energy</code>（节奏强度）、<code>valence</code>（积极度）、<code>danceability</code>（舞动性）与曲风/标签/搜索词。</li>
              <li>本地打分：<code class="f">score = 0.35·(1−|Δenergy|) + 0.35·(1−|Δvalence|) + 0.15·(1−|Δdanceability|) + 0.10·标签重合率 + 0.05·曲风重合率</code>，×100 后降序取 Top6。</li>
              <li>策略决策（S1）：智能模式下，当情绪效价 <code>v &lt; −0.15</code> 时改用「情绪修复」，否则「同频镜像」。</li>
              <li>情绪修复：<code>target = target + (anchor − target) × 0.62</code>，锚点为 energy .50 / valence .82 / danceability .45，把目标推向明亮平和。</li>
              <li>在线补充：用情绪搜索词请求在线音乐接口，拿到可播放直链；接口不可用时不影响本地推荐。</li>
            </ol>
            <p class="tip">多样性重排：同一艺人/同一曲风最多连排 2 首，避免歌单同质化。</p>
          </section>

          <!-- 数据 -->
          <section>
            <h4><span class="no">03</span>曲库与数据</h4>
            <p class="kw">
              本地曲库：<b>SoundHelix</b> 提供的 royalty-free 可商用试听曲，已登记 energy / valence / danceability 特征；
              在线：公共音乐接口返回直链，失败自动回退本地，保证系统始终可用。
            </p>
          </section>
        </div>

        <footer class="df">
          <span>隐私：画面与识别结果只留在你的浏览器里，不会上传</span>
          <button class="ok" @click="$emit('close')">知道了</button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

function onKey(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(20, 20, 22, .44);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.dialog {
  width: min(720px, 100%); max-height: 84vh; display: flex; flex-direction: column;
  background: #fff; border-radius: 18px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, .24);
}
.dh {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--line-soft);
}
.dh h3 { margin: 0; font-size: 15px; }
.dh p { margin: 4px 0 0; font-size: 11.5px; color: var(--muted); }
.x {
  border: none; background: #f4f3ef; color: var(--ink-2); width: 26px; height: 26px;
  border-radius: 8px; cursor: pointer; font-size: 11px;
}
.x:hover { background: #ebe9e4; }

.body { padding: 16px 20px 6px; overflow-y: auto; }
section + section { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--line-soft); }
h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; }
.no {
  font-size: 10px; font-weight: 700; color: var(--accent);
  background: var(--accent-soft); padding: 2px 6px; border-radius: 6px;
}
.kw { margin: 0 0 8px; font-size: 11.5px; color: var(--ink-2); line-height: 1.75; }
code {
  font-family: 'SFMono-Regular', Consolas, monospace; font-size: 10.8px;
  background: #f5f4f0; border: 1px solid var(--line-soft); border-radius: 5px;
  padding: 1px 5px; color: #4c4d50;
}
code.f { display: inline-block; line-height: 1.7; }
ol { margin: 0; padding-left: 18px; font-size: 11.8px; color: var(--ink-2); line-height: 1.85; }
li + li { margin-top: 3px; }
li b { color: var(--ink); }
.tip { margin: 8px 0 0; font-size: 11px; color: var(--muted); line-height: 1.7; }

.df {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 20px; border-top: 1px solid var(--line-soft); background: #fcfbf9;
  font-size: 10.5px; color: var(--muted-2);
}
.ok {
  border: none; background: var(--dark); color: #fff; font-size: 12px;
  padding: 8px 16px; border-radius: 9px; cursor: pointer;
}
.ok:hover { background: #000; }

.fade-enter-active, .fade-leave-active { transition: opacity .18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
