// ============================================================================
// 静态资源 URL 解析
// ----------------------------------------------------------------------------
// 项目需要同时跑在：
//   1) 本地开发  http://localhost:5173/                  （根路径）
//   2) GitHub Pages  https://<user>.github.io/<repo>/    （子路径）
// 因此所有放在 public/ 下的资源（models、music、demo-faces、data）都不能写死
// 以 "/" 开头的绝对路径，否则在子路径部署时会请求到域名根目录而 404。
//
// vite 的 import.meta.env.BASE_URL：
//   dev   -> "/"
//   build -> "./"（vite.config.js 里 base: './'）
// 拼接后 fetch/audio/img 都能按当前页面地址正确解析。
// ============================================================================

/** 把 public 下的资源路径转成当前部署环境可用的 URL */
export function assetUrl(path) {
  if (!path) return ''
  // 已经是完整 URL / blob / data URI 时原样返回
  if (/^(https?:)?\/\//i.test(path) || /^(blob|data):/i.test(path)) return path
  // 去掉开头的 "/"，避免变成域名根路径
  return `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`
}

export default assetUrl
