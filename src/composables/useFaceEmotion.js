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

// 必须基于 BASE_URL（vite base）拼接：GitHub Pages 部署在 /<repo>/ 子路径下，
// 写死 '/models' 会请求到 https://<user>.github.io/models/... 导致 404。
// dev 下 BASE_URL='/' -> '/models'；build 下 BASE_URL='./' -> './models'
const MODEL_URL = `${import.meta.env.BASE_URL}models`

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

  // 把输入（图片 / 视频帧 / canvas）绘制到离屏 canvas；enhance=true 时对暗图做提亮 + 轻度对比拉伸。
  // 目的：暗光/逆光照片在原图直接检测时特征太弱，容易漏检；提亮后 tinyFaceDetector 更易检出。
  function drawToCanvas(input, enhance) {
    try {
      const w = input.videoWidth || input.naturalWidth || input.width || 0
      const h = input.videoHeight || input.naturalHeight || input.height || 0
      if (!w || !h) return null
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(input, 0, 0, w, h)
      if (enhance) {
        const img = ctx.getImageData(0, 0, w, h)
        const d = img.data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) {
          sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
        }
        const mean = sum / (d.length / 4) // 0~255 平均亮度
        if (mean < 120) {
          // 越暗给越强的 gamma 提亮（上限 2.4），再叠加 8% 对比度，避免整片发灰
          const gamma = Math.min(2.4, Math.max(1.0, 120 / Math.max(mean, 25)))
          const lut = new Uint8ClampedArray(256)
          for (let v = 0; v < 256; v++) {
            let out = Math.pow(v / 255, 1 / gamma) * 255
            out = (out - 128) * 1.08 + 128
            lut[v] = out < 0 ? 0 : out > 255 ? 255 : out
          }
          for (let i = 0; i < d.length; i += 4) {
            d[i] = lut[d[i]]
            d[i + 1] = lut[d[i + 1]]
            d[i + 2] = lut[d[i + 2]]
          }
          ctx.putImageData(img, 0, 0)
        }
      }
      return c
    } catch (e) {
      // 跨域污染等情况：退化为直接使用原输入
      return null
    }
  }

  // 对单帧（图片 / 视频当前帧 / canvas）做情绪识别
  // opts:
  //   retry   —— 默认 true：未检出时按「参数阶梯」逐级放宽重试（仅用于单张图片，勿用于实时循环）
  //   enhance —— 默认 true：检测前对暗图自动提亮（同上，实时循环应关闭以保证帧率）
  async function detect(input, opts = {}) {
    if (!modelsLoaded.value) {
      const ok = await initModels()
      if (!ok) return null
    }

    // 暗光增强：仅当输入是 <img>/<video>/<canvas> 时生效
    let src = input
    if (opts.enhance !== false) {
      const c = drawToCanvas(input, true)
      if (c) src = c
    }

    const run = (inputSize, scoreThreshold) =>
      faceapi
        .detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
        .withFaceExpressions()

    // 参数阶梯：从严到宽。暗光/侧脸/紧锁眉在小输入严阈值下常漏检，
    // 逐级「放大输入 + 降低人脸分阈值」能显著提升命中率（首级仍保留原行为）。
    const ladder =
      opts.retry === false
        ? [[opts.inputSize || 224, opts.scoreThreshold ?? 0.5]]
        : [
            [opts.inputSize || 224, opts.scoreThreshold ?? 0.5],
            [416, 0.3],
            [512, 0.2],
            [608, 0.12]
          ]

    let result = null
    for (const [size, thr] of ladder) {
      try {
        result = await run(size, thr)
      } catch (e) {
        result = null
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
      box: box
    }
  }

  // 对视频流持续识别（用于实时摄像头）
  function startLoop(videoEl, onResult, intervalMs = 600) {
    stopLoop()
    loopTimer = setInterval(async () => {
      if (videoEl.readyState < 2) return
      try {
        // 实时循环关闭「阶梯重试」与「暗光提亮」：每帧只跑一次推理，保证流畅度
        const res = await detect(videoEl, { retry: false, enhance: false })
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
