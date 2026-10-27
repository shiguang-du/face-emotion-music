# 人脸情绪识歌 · Face Emotion Music

基于 **Vue3 + Vite** 的「人脸情绪识别 → 歌曲推荐」系统。人脸情绪识别**完全在浏览器本地完成**（@vladmandic/face-api + TensorFlow.js），不依赖任何后端；歌曲来源同时支持**本地曲库**与**在线音乐接口**。

> 🌐 在线演示：<https://shiguang-du.github.io/face-emotion-music/>
> 📦 代码仓库：<https://github.com/shiguang-du/face-emotion-music>

### 部署方式（GitHub Pages）
- `.github/workflows/deploy.yml`：push 到 `main` 后自动构建并发布到 Pages。
- `vite.config.js` 使用相对基路径 `base: './'`，在 `/<repo>/` 子路径下资源可正确加载。
- 首次需在仓库 Settings → Pages 中把 Source 设为 **GitHub Actions**（已自动配置）。

---

## 一、功能

- 四种人脸获取方式：
  - 🎭 **示例人脸**（内置 7 种情绪真实照片，点一下即识别，最适合演示）
  - 🖼 **上传图片**（jpg/png 等人脸照片）
  - 🎞 **打开视频文件**（识别某一帧）
  - 📹 **实时摄像头**（自动循环识别当前情绪）
  - 📸 **拍照**（摄像头抓拍单帧识别）
- 本地情绪识别：输出 7 类情绪概率与主导情绪
- 按情绪推荐歌曲：本地曲库（离线可放）+ 在线接口（直链播放）
- 内置音乐播放器（播放 / 暂停 / 进度）

---

## 二、运行

```bash
cd face-emotion-music
npm install          # 安装依赖（vue / @vladmandic/face-api / vite）
npm run dev          # 开发预览，默认 http://localhost:5173
# 或
npm run build && npm run preview   # 生产构建 + 预览
```

> ⚠️ 必须用 `http(s)` 访问（如 localhost），不能用 `file://` 直接打开，否则模型权重与摄像头无法加载。
> 摄像头/拍照功能需要 HTTPS 或 localhost，且需授权摄像头权限。

---

## 三、算法一：本地人脸情绪识别（明确流程）

**引擎**：[@vladmandic/face-api](https://github.com/vladmandic/face-api)（face-api.js 的活跃维护分支，基于 TensorFlow.js，自带并自动注册 webgl/cpu 后端，模型与推理全在浏览器端）。

**模型**（已随包发布在 `public/models/`，离线可用）：
| 模型 | 作用 | 说明 |
|------|------|------|
| `tinyFaceDetector` | 人脸检测 | SSD 轻量版，输入 224×224，速度快、精度高 |
| `faceExpressionNet` | 表情分类 | 输出 7 类情绪概率分布 |

**推理流程**（`src/composables/useFaceEmotion.js`）：
1. 加载模型权重 `loadFromUri('/models')`，后端优先 WebGL（GPU 加速），失败回退 CPU；
2. `detectSingleFace(input, TinyFaceDetectorOptions).withFaceExpressions()` 在检测到的人脸框上跑表情网络；
3. 得到 7 类概率：`neutral / happy / sad / angry / fearful / disgusted / surprised`；
4. `asSortedArray()[0]` 取概率最大者作为**主导情绪**，同时保留完整分布用于可视化。
5. 视频流模式下用 `setInterval`（默认 600ms）持续识别，情绪切换时才刷新推荐，避免抖动。

---

## 四、算法二：歌曲推荐（明确流程）

**核心**：把「情绪」翻译成「音乐特征画像」，再用**加权距离打分**对候选歌曲排序。

### 1）情绪 → 目标音乐画像（`src/services/emotionProfile.js`）
每种情绪定义目标特征：

| 情绪 | energy | valence | danceability | 曲风/标签倾向 | 在线搜索词 |
|------|--------|---------|--------------|---------------|------------|
| 开心 happy | 0.85 | 0.95 | 0.80 | pop/dance/欢快 | 快乐, happy |
| 悲伤 sad | 0.25 | 0.15 | 0.20 | ballad/钢琴/伤感 | 伤感, sad |
| 愤怒 angry | 0.92 | 0.20 | 0.55 | rock/metal/燃 | 摇滚, rock |
| 恐惧 fearful | 0.30 | 0.30 | 0.20 | ambient/舒缓 | 安静, calm |
| 厌恶 disgusted | 0.40 | 0.30 | 0.30 | lofi/jazz/慵懒 | 慵懒, lofi |
| 惊讶 surprised | 0.70 | 0.70 | 0.70 | edm/funk/动感 | 惊喜, edm |
| 平静 neutral | 0.50 | 0.50 | 0.50 | acoustic/轻松 | 轻松, relaxed |

（energy=节奏强度，valence=情绪积极度，danceability=舞动性，均为 0~1）

### 1.5）S1 目标决策：推荐策略（`src/services/strategy.js`）
推荐目标未必等于当前情绪，由「推荐策略」决定（界面上可切换）：

1. **S1 目标决策**：镜像（跟随当前情绪）/ 修复（向锚点迁移，k=0.62）/ 智能（v<-0.15 时修复，否则镜像）。

- **同频镜像 mirror**：目标 = 当前情绪画像，音乐情感坐标尽量贴近此刻情绪，适合共鸣式聆听。
- **情绪修复 repair**：把目标坐标以 0.62 的步长推向该情绪的修复锚点（积极·平和坐标 energy 0.5 / valence 0.82 / danceability 0.45），用于消极情绪疏导。
- **智能 auto**：愉悦度 `v = valence×2 − 1` 低于 `-0.15` 时用「修复」，否则用「镜像」。

### 2）本地曲库打分（`src/composables/useRecommend.js`）
对每首本地歌曲按以下公式计算匹配分（0~100）：

```
score = 0.35 × (1 − |Δenergy|)
      + 0.35 × (1 − |Δvalence|)
      + 0.15 × (1 − |Δdanceability|)
      + 0.10 × (标签重合率)
      + 0.05 × (曲风重合率)       结果 ×100
```

- 三项特征越接近目标画像分越高；
- 标签/曲风重合给予额外加分；
- 按分数降序取 Top 6 作为「本地推荐」。

### 3）在线接口（`src/services/onlineMusicApi.js`）
- 用情绪的搜索词（如「快乐」）调用在线接口，返回可播放直链；
- 默认接口：`https://api.vvhan.com/api/music?name=<关键词>`（公共服务，开启 CORS）；
- **失败自动回退本地曲库**，系统始终可用；
- 可替换 `ONLINE_API_ENDPOINT` / `FALLBACK_API_ENDPOINT` 为你自己的接口（保持 `name`/`url`/`title`/`artist` 字段约定即可）。

> 注：在线接口为第三方公共服务，可能随网络或政策变动；本地曲库（SoundHelix 提供的 royalty-free 试听曲）保证离线也能播放与推荐。

---

## 五、目录结构

```
face-emotion-music/
├─ index.html
├─ vite.config.js
├─ package.json
├─ public/
│  ├─ models/            # face-api 模型权重（tinyFaceDetector + faceExpressionNet）
│  ├─ music/             # 本地歌曲 mp3（SoundHelix，royalty-free）
│  └─ data/
│     └─ localSongs.json # 本地曲库元数据 + 情绪特征
└─ src/
   ├─ main.js
   ├─ App.vue            # 主流程编排
   ├─ style.css
   ├─ services/
   │  ├─ emotionProfile.js   # 情绪→音乐特征映射（算法二·画像）
   │  └─ onlineMusicApi.js   # 在线音乐接口（可插拔）
   ├─ composables/
   │  ├─ useFaceEmotion.js   # 本地情绪识别（算法一）
   │  └─ useRecommend.js     # 推荐引擎（算法二·打分）
   └─ components/
      ├─ CapturePanel.vue    # 图片/视频/摄像头/拍照 采集
      ├─ EmotionResult.vue   # 情绪概率可视化
      ├─ RecommendList.vue   # 推荐列表
      └─ MusicPlayer.vue     # 播放器
```

---

## 六、扩充本地曲库

把任意 mp3 放到 `public/music/`，并在 `public/data/localSongs.json` 的 `songs` 数组里登记
（填写 `file` 路径及 `energy/valence/danceability/tags/genres/moods` 等特征）即可被推荐算法收录。
