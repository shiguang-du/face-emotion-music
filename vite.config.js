import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发服务器开启 host，方便局域网/沙箱预览；模型权重放在 public/models，构建后随包发布
export default defineConfig({
  // 相对基路径：本地开发与 GitHub Pages 项目页（/<repo>/）都能正确加载资源
  base: './',
  plugins: [vue()],
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'es2018',
    chunkSizeWarningLimit: 4000
  }
})
