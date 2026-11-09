import type { Kind, Layer } from './axis.js'

/** 一份资产由归属层与内容类唯一确定。 */
export type Asset = { readonly layer: Layer; readonly kind: Kind }

export const asset = (layer: Layer, kind: Kind): Asset => ({ layer, kind })

export const isAsset = (a: Asset, b: Asset) => a.layer === b.layer && a.kind === b.kind
