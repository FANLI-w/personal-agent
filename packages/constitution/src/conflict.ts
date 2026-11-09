import { layerRank, type Layer } from './axis.js'

/**
 * 同一条事实被两层同时声明：高层生效，低层判不合规。
 * 同层返回 null，交由人裁定，系统不做自动取舍。
 */
export function higherLayer(a: Layer, b: Layer): Layer | null {
  if (a === b) return null
  return layerRank[a] > layerRank[b] ? a : b
}

export function lowerLayer(a: Layer, b: Layer): Layer | null {
  if (a === b) return null
  return layerRank[a] < layerRank[b] ? a : b
}
