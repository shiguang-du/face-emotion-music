// ============================================================================
// 本地人脸情绪识别（核心算法）
// ----------------------------------------------------------------------------
// 引擎：@vladmandic/face-api（face-api.js 的活跃维护分支，基于 TensorFlow.js，模型与推理全部在浏览器本地完成，无服务端调用）
// 模型：
//   - tinyFaceDetector : 轻量人脸检测（SSD 精简版，输入 224×224，速度快）
//   - faceExpressionNet: 表情分类，输出 7 类情绪概率
// 算法流程：
//   1. 加载模型权重（public/models，随包发布，离线可用）
//   2. 用 tinyFaceDetector 检测人脸框
//   3. withFaceExpressions() 在人脸框上跑 faceExpressionNet，得到 7 类概率
//   4. 取概率最大的类别作为"主导情绪"，返回完整概率分布
// ============================================================================

import { ref } from 'vue'
// @vladmandic/face-api 是 face-api.js 的活跃维护分支：API 完全一致，且自带并自动注册
// tfjs 的 webgl/cpu 后端，避免后端未注册的运行时报错。模型权重与原版通用。
import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = '/models'

export function useFaceEmotion() {
  const modelsLoaded = ref(false)
  const loadingModels = ref(false)
  const initError = ref('')
  let loopTimer = null

  async function initModels() {
    if (modelsLoaded.value) return true
    loadingModels.value = true
    initError.value = ''
    try {
      // 优先 WebGL 后端（GPU 加速），失败回退 CPU
      try {
        await faceapi.tf.setBackend('webgl')
      } catch (e) {
        await faceapi.tf.setBackend('cpu')
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

  // 对单帧（图片 / 视频当前帧 / canvas）做情绪识别
  async function detect(input) {
    if (!modelsLoaded.value) {
      const ok = await initModels()
      if (!ok) return null
    }
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5
    })
    const result = await faceapi
      .detectSingleFace(input, options)
      .withFaceExpressions()

    if (!result) return null

    const expressions = result.expressions // 形如 {neutral:0.1, happy:0.8, ...}
    const sorted = result.expressions.asSortedArray() // [{expression, probability}]
    const dominant = sorted[0].expression
    const box = result.detection?.box // {x,y,width,height}
    return {
      expressions: expressions,
      sorted: sorted,
      dominant: dominant,
      box: box
    }
  }

  // 对视频流持续识别（用于实时摄像头）
  function startLoop(videoEl, onResult, intervalMs = 600) {
    stopLoop()
    loopTimer = setInterval(async () => {
      if (videoEl.readyState < 2) return
      try {
        const res = await detect(videoEl)
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

  return { modelsLoaded, loadingModels, initError, initModels, detect, startLoop, stopLoop }
}
