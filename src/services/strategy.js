// ============================================================================
// 推荐策略（S1 目标决策）
// ----------------------------------------------------------------------------
// 情绪识别给出"当前情绪"，但推荐目标未必等于当前情绪。由策略决定：
//   同频镜像(mirror)：目标 = 当前情绪画像，音乐情感坐标尽量贴近此刻情绪，
//                      适合共鸣式聆听（"陪我一起难过"）。
//   情绪修复(repair)：目标 = 从当前情绪坐标向"修复锚点"迁移 k 步，
//                      用于消极情绪的疏导（"把我从低谷拉出来"）。
//   智能(auto)      ：愉悦度 v<-0.15 时用修复，否则用镜像。
//
// 愉悦度 valence 在画像里是 0~1，这里换算成 -1~1 的有符号值：
//   v = valence * 2 - 1
// ============================================================================

export const STRATEGIES = [
  {
    key: 'auto',
    label: '智能',
    desc: '智能：愉悦度低于 -0.15 时自动切换到「情绪修复」，否则使用「同频镜像」。'
  },
  {
    key: 'mirror',
    label: '同频镜像',
    desc: '同频镜像：让音乐情感坐标尽量贴近你此刻的情绪，适合共鸣式聆听。'
  },
  {
    key: 'repair',
    label: '情绪修复',
    desc: '情绪修复：以 0.62 的步长把目标坐标推向该情绪的修复锚点，用于消极情绪的疏导。'
  }
]

// 向锚点迁移的步长 k
export const REPAIR_STEP = 0.62

// 修复锚点：积极、平和、不吵不闹的音乐坐标（安抚型目标）
const REPAIR_ANCHOR = { energy: 0.5, valence: 0.82, danceability: 0.45 }

// 0~1 valence -> -1~1 有符号愉悦度
export function valenceSigned(target) {
  return (target?.valence ?? 0.5) * 2 - 1
}

// 决定最终采用哪种策略：返回 'mirror' | 'repair'
export function decideStrategy(strategyKey, target) {
  if (strategyKey === 'auto') {
    return valenceSigned(target) < -0.15 ? 'repair' : 'mirror'
  }
  return strategyKey === 'repair' ? 'repair' : 'mirror'
}

// 把情绪画像 target 变换为最终推荐目标；mode 记录实际生效的策略
export function resolveTarget(strategyKey, target) {
  const mode = decideStrategy(strategyKey, target)
  if (mode === 'mirror') {
    return { ...target, mode }
  }
  // 修复：target + (anchor - target) * k
  return {
    ...target,
    energy: target.energy + (REPAIR_ANCHOR.energy - target.energy) * REPAIR_STEP,
    valence: target.valence + (REPAIR_ANCHOR.valence - target.valence) * REPAIR_STEP,
    danceability: target.danceability + (REPAIR_ANCHOR.danceability - target.danceability) * REPAIR_STEP,
    mode
  }
}
