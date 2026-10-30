// ============================================================================
// 本地人脸情绪识别（核心算法）
// ----------------------------------------------------------------------------
// 引擎：@vladmandic/face-api（face-api.js 的活跃维护分支，基于 TensorFlow.js，模型与推理全部在浏览器本地完成，无服务端调用）
// 模型：
//   - tinyFaceDetector : 轻量人脸检测（SSD 精简版，输入 320×320 / 416×416，速度快）
//   - faceExpressionNet: 表情分类，输出 7 类情绪概率
// 算法流程：
//   1. 加载模型权重（public/models，随包发布，离线可用）
//   2. 用 tinyFaceDetector 检测人脸框（scoreThreshold 可调 = UI 的「检测灵敏度」）
//   3. withFaceExpressions() 在人脸框上跑 faceExpressionNet，得到 7 类概率
//   4. 取概率最大的类别作为"主导情绪"，返回完整概率分布
// ============================================================================

import { ref } from 'vue'
// @vladmandic/face-api 是 face-api.js 的活跃维护分支：API 完全一致，且自带并自动注册
// tfjs 的 webgl/cpu 后端，避免后端未注册的运行时报错。模型权重与原版通用。
import * as faceapi from '@vladmandic/face-api'

// 必须基于 BASE_URL（vite base）拼接：GitHub Pages 部署在 /<repo>/ 子路径下，
// 写死 '/models' 会请求到 https://<user>.github.io/models/... 导致 404。
// dev 下 BASE_URL='/' -> '/models'；build 下 BASE_URL='./' -> './models'
const MODEL_URL = `${import.meta.env.BASE_URL}models`

export function useFaceEmotion() {
  const modelsLoaded = ref(false)
  const loadingModels = ref(false)
  const initError = ref('')
  // 实际使用的推理后端：webgl（GPU 加速）或 cpu（回退）
  const backend = ref('')
  let loopTimer = null

  async function initModels() {
    if (modelsLoaded.value) return true
    loadingModels.value = true
    initError.value = ''
    try {
      // 优先 WebGL 后端（GPU 加速），失败回退 CPU
      try {
        await faceapi.tf.setBackend('webgl')
        backend.value = 'webgl'
      } catch (e) {
        await faceapi.tf.setBackend('cpu')
        backend.value = 'cpu'
      }
      await faceapi.tf.ready()

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      ])
      modelsLoaded.value = true
      return true
    } catch (e) {
      initError.value = '模型加载失败：' + e.message
      console.error(e)
      return false
    } finally {
      loadingModels.value = false
    }
  }

  /**
   * 对单帧（图片 / 视频当前帧 / canvas）做情绪识别
   * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} input
   * @param {{scoreThreshold?: number, inputSize?: number}} opts
   *        scoreThreshold 越小越灵敏（0.2~0.9），inputSize 越大越准但越慢
   */
  async function detect(input, opts = {}) {
    if (!modelsLoaded.value) {
      const ok = await initModels()
      if (!ok) return null
    }
    const run = (inputSize, scoreThreshold) => {
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
      return faceapi.detectSingleFace(input, options).withFaceExpressions()
    }
    const reqSize = opts.inputSize || 320
    const reqThr = opts.scoreThreshold ?? 0.6

    // 兜底重试阶梯：部分示例/小脸在 320@0.6 下人脸分偏低会被判为"未检测到"，
    // 依次用更大输入 + 更低阈值再试，显著提升命中率。仅在单侧识别（图片/示例）时生效，
    // 实时摄像头循环传入 retry:false，避免每帧多次推理拖慢帧率。
    const ladder = [
      { inputSize: reqSize, scoreThreshold: reqThr },
      { inputSize: 512, scoreThreshold: 0.3 },
      { inputSize: 608, scoreThreshold: 0.15 }
    ]
    let result = null
    for (const a of ladder) {
      if (a.inputSize === reqSize && a.scoreThreshold === reqThr && result === null) {
        result = await run(reqSize, reqThr)
      } else if (opts.retry !== false) {
        result = await run(a.inputSize, a.scoreThreshold)
      }
      if (result) break
    }

    if (!result) return null

    const expressions = result.expressions // 形如 {neutral:0.1, happy:0.8, ...}
    const sorted = result.expressions.asSortedArray() // [{expression, probability}]
    const dominant = sorted[0].expression
    const box = result.detection?.box // {x,y,width,height}
    return {
      expressions: expressions,
      sorted: sorted,
      dominant: dominant,
      box: box,
      score: result.detection?.score ?? 0,
      inputSize: opts.inputSize || 320
    }
  }

  // 对视频流持续识别（用于实时摄像头）
  function startLoop(videoEl, onResult, opts = {}) {
    stopLoop()
    const intervalMs = opts.intervalMs || 600
    loopTimer = setInterval(async () => {
      if (videoEl.readyState < 2) return
      try {
        const res = await detect(videoEl, opts)
        if (res) onResult(res)
      } catch (e) {
        /* 单帧失败忽略，继续下一帧 */
      }
    }, intervalMs)
  }

  function stopLoop() {
    if (loopTimer) {
      clearInterval(loopTimer)
      loopTimer = null
    }
  }

  return { modelsLoaded, loadingModels, initError, backend, initModels, detect, startLoop, stopLoop }
}
