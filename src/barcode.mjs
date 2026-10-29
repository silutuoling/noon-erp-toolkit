/**
 * barcode.mjs —— 商品条码校验与尺寸规则（EAN-13 / UPC-A / EAN-8 / Code128）
 *
 * 卖家贴错条码的后果很具体：入仓扫描失败、被拒收、发错货。
 * 这里覆盖三类最常见的问题：
 *
 *   ① 校验位算错 —— EAN/UPC 最后一位是校验位，抄错一位整条码就废
 *   ② 码制选错 —— 长度对不上（12/8/13 位各对应不同码制）
 *   ③ 尺寸不达标 —— GS1 对条码印刷尺寸有标称值，缩太小扫不出来
 *
 * 🔴 Code128 的官方要求里点名避免 + / % & 这几个符号，且不能有空格、上限 16 位。
 *    很多人拿内部 SKU 直接当条码打，就是卡在这。
 *
 * 在线版（可生成 SVG、批量排版到 A4）：暂未上线，本模块是目前唯一的可用之处。
 */

/** Code128 字符上限 */
export const MAX_LEN = 16
/** 官方点名「尽量避免」的符号 */
export const OFFICIAL_SYMBOLS = ['+', '/', '-', '%', '&']
/** 条码最窄单元宽度下限（mm），低于这个印刷必然糊 */
export const MIN_X_MM = 0.25
/** 条码两侧静区（quiet zone）要求（mm） */
export const QUIET_MM = 2.5

/** GS1 标称 X 尺寸（窄条宽度），EAN-13 / EAN-8 / UPC-A 均为 0.33mm */
export const GS1_X_MM = 0.33
/** GS1 允许的缩放区间（以标称尺寸为 100%） */
export const GS1_SCALE_MIN = 80
export const GS1_SCALE_MAX = 200

export const SYM_LABEL = {
  ean13: 'EAN-13',
  upca: 'UPC-A',
  ean8: 'EAN-8',
  code128: 'Code128',
}

const EAN_MODULES = { ean13: 95, upca: 95, ean8: 67, code128: 0 }

/**
 * EAN / UPC 校验位：数据段从右往左交替 ×3 / ×1 累加，取补足到 10 的差。
 * @param {string} data 不含校验位的数据段
 * @returns {number} 应有的校验位
 */
export function eanCheckDigit(data) {
  let sum = 0
  let w = 3
  for (let i = data.length - 1; i >= 0; i--) {
    sum += Number(data[i]) * w
    w = w === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10
}

/** 按长度判定码制：13 位 EAN-13、12 位 UPC-A、8 位 EAN-8，其余按 Code128 */
export function detect(code) {
  if (/^\d{13}$/.test(code)) return 'ean13'
  if (/^\d{12}$/.test(code)) return 'upca'
  if (/^\d{8}$/.test(code)) return 'ean8'
  return 'code128'
}

/** 按官方字符集清洗：只留字母数字、转大写、截到 16 位 */
export function suggest(code) {
  return String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, MAX_LEN)
}

/** 模块数估算（判断印刷宽度够不够）。Code128 每字符 11 模块 + 起止与校验约 35 */
export function estModules(code, sym) {
  if (sym !== 'code128') return EAN_MODULES[sym]
  return 11 * code.length + 35
}

/**
 * 检查一个条码值。
 * @param {string} code
 * @param {'ean13'|'upca'|'ean8'|'code128'} [sym] 不传则自动判定
 * @returns {{sym:string, problems:string[], warns:string[]}}
 *   problems = 硬性不合规，打出去会被拒收
 */
export function checkCode(code, sym) {
  const s = sym ?? detect(code)
  const problems = []
  const warns = []

  if (s === 'code128') {
    if (code.length > MAX_LEN) problems.push(`超出 ${MAX_LEN} 字符上限（当前 ${code.length} 位）`)
    if (/\s/.test(code)) problems.push('含空格（官方要求字符之间不留空格）')

    const hit = OFFICIAL_SYMBOLS.filter((x) => code.includes(x))
    if (hit.length > 0) problems.push(`含官方点名避免的符号 ${hit.join(' ')}`)

    const other = [...new Set(code.replace(/[A-Za-z0-9\s+/%&-]/g, '').split(''))]
    if (other.length > 0) problems.push(`含非字母数字字符 ${other.slice(0, 4).join(' ')}`)
  } else {
    const need = s === 'ean13' ? 13 : s === 'upca' ? 12 : 8
    if (code.length !== need) {
      problems.push(`${SYM_LABEL[s]} 需要 ${need} 位，当前 ${code.length} 位`)
    } else if (!/^\d+$/.test(code)) {
      problems.push(`${SYM_LABEL[s]} 只能使用数字`)
    } else {
      const want = eanCheckDigit(code.slice(0, -1))
      const got = Number(code.slice(-1))
      if (want !== got) problems.push(`${SYM_LABEL[s]} 校验位应为 ${want}，当前是 ${got}`)
    }
  }

  return { sym: s, problems, warns }
}

/** 实际印刷 X 尺寸相当于 GS1 标称值的百分比 */
export function gs1ScalePct(xMm) {
  return (xMm / GS1_X_MM) * 100
}

/** 缩放比例是否在 GS1 允许区间（80%–200%） */
export function gs1ScaleOk(pct) {
  return pct >= GS1_SCALE_MIN && pct <= GS1_SCALE_MAX
}

/** 该码制是否受 GS1 尺寸约束（Code128 不受，厂商条码受） */
export function isGs1(sym) {
  return sym !== 'code128'
}
