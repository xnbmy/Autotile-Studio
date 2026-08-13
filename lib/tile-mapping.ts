// Bitmask mapping tables for the 16-tile (4-bit classic) and 47-tile (8-bit blob) autotile systems.

export interface NeighborBits {
  n: boolean
  e: boolean
  s: boolean
  w: boolean
  ne: boolean
  se: boolean
  sw: boolean
  nw: boolean
}

export function encode16(n: boolean, e: boolean, s: boolean, w: boolean) {
  let m = 0
  if (n) m |= 1
  if (e) m |= 2
  if (s) m |= 4
  if (w) m |= 8
  return m
}

export function maskToBits16(mask: number): NeighborBits {
  return {
    n: !!(mask & 1),
    e: !!(mask & 2),
    s: !!(mask & 4),
    w: !!(mask & 8),
    ne: false,
    se: false,
    sw: false,
    nw: false,
  }
}

export const MASK16_LIST = Array.from({ length: 16 }, (_, i) => i)
export const MASK16_COLUMNS = 4

export interface Blob47Entry {
  mask: number
  bits: NeighborBits
  index: number
}

// Encodes raw 8-neighbor booleans into the reduced blob mask: a diagonal bit
// can only be set when both of its adjacent cardinal neighbors are present.
// This is the standard 256 -> 47 reduction used by "blob" autotile sets.
export function encodeBlob47(raw: {
  n: boolean
  ne: boolean
  e: boolean
  se: boolean
  s: boolean
  sw: boolean
  w: boolean
  nw: boolean
}) {
  const { n, e, s, w } = raw
  const ne = raw.ne && n && e
  const se = raw.se && s && e
  const sw = raw.sw && s && w
  const nw = raw.nw && n && w
  let mask = 0
  if (n) mask |= 1
  if (ne) mask |= 2
  if (e) mask |= 4
  if (se) mask |= 8
  if (s) mask |= 16
  if (sw) mask |= 32
  if (w) mask |= 64
  if (nw) mask |= 128
  return mask
}

function generateBlob47(): Blob47Entry[] {
  const entries: Blob47Entry[] = []
  for (let m = 0; m < 256; m++) {
    const n = !!(m & 1)
    const ne = !!(m & 2)
    const e = !!(m & 4)
    const se = !!(m & 8)
    const s = !!(m & 16)
    const sw = !!(m & 32)
    const w = !!(m & 64)
    const nw = !!(m & 128)
    if (ne && !(n && e)) continue
    if (se && !(s && e)) continue
    if (sw && !(s && w)) continue
    if (nw && !(n && w)) continue
    entries.push({ mask: m, bits: { n, e, s, w, ne, se, sw, nw }, index: entries.length })
  }
  return entries
}

export const BLOB47: Blob47Entry[] = generateBlob47()
export const BLOB47_BY_MASK = new Map<number, Blob47Entry>(BLOB47.map((e) => [e.mask, e]))
export const BLOB47_COLUMNS = 8

// User-provided 47 Blob standard layout (5 rows x 11 columns).
// `null` cells are intentionally blank. The 47 non-null entries cover
// all Blob masks except duplicates; mask 0 is the isolated island tile.
export const BLOB_STANDARD_COLUMNS = 11
export const BLOB_STANDARD_ORDER: (number | null)[] = [
  28, 124, 112, 16, 20, 116, 92, 80, 84, 221, null,
  31, 255, 241, 17, 23, 247, 223, 209, 215, 119, null,
  7, 199, 193, 1, 29, 253, 127, 113, 125, 93, 117,
  4, 68, 64, 0, 5, 197, 71, 65, 69, 87, 213,
  null, null, null, null, 21, 245, 95, 81, 85, null, null,
]

export function blob47IndexForMask(mask: number): number {
  return BLOB47_BY_MASK.get(mask)?.index ?? 0
}
