/**
 * volumetric.mjs —— 体积重 / 计费重换算
 *
 * 物流按「实重」和「体积重」取大计费。体积重 = 长×宽×高 ÷ 除数。
 * 除数不是固定的：5,000 是 Noon UAE / DirectShip 的默认值，轻抛货用 6,000，
 * 密实重货有些货代用 4,000。填错除数会让报价差一档。
 *
 * 在线版（含「这箱有多少是空气」的压缩建议）：https://noonmate.com/tool/volumetric
 */

/** 常用除数与适用场景（行业惯例，最终以货代 / 平台账单为准） */
export const DIVISORS = {
  5000: '标准件，Noon UAE / DirectShip 默认，大多数货适用',
  6000: '轻抛件，大箱装轻货（抱枕、保温袋、填充玩具等）',
  4000: '重货 / 密实体，部分货代对五金、液体用这档',
  3000: '部分国内快递与专线渠道',
}

/**
 * 体积重。
 * @param {number} length 长 cm
 * @param {number} width 宽 cm
 * @param {number} height 高 cm
 * @param {number} [divisor=5000]
 * @returns {number} 体积重 kg（未取整，保留完整精度）
 */
export function volumetricWeight(length, width, height, divisor = 5000) {
  const cbm = length * width * height
  return divisor > 0 ? cbm / divisor : 0
}

/**
 * 计费重 = max(实重, 体积重)。
 * @returns {{cbm:number, volumetric:number, actual:number, billable:number, byVolume:boolean}}
 */
export function chargeableWeight({ length, width, height, actual, divisor = 5000 }) {
  const cbm = length * width * height
  const volumetric = divisor > 0 ? cbm / divisor : 0
  const billable = Math.max(volumetric, actual)
  return { cbm, volumetric, actual, billable, byVolume: volumetric > actual }
}

/**
 * 装箱装填率 = 实重 ÷ 体积重。
 * ≥ 1 表示按实重计费（箱子装得够实）；越低说明箱子里空气越多，越亏。
 * @returns {number} 0–1 之间通常意味着「箱子里一半以上是空气」
 */
export function fillRate(actual, volumetric) {
  return volumetric > 0 ? actual / volumetric : 0
}

/**
 * 体积重压回到实重，箱容最多能有多少 cm³。
 * 用来回答「我箱子要缩到多小才不按体积重收费」。
 */
export function maxVolumeForActualWeight(actual, divisor = 5000) {
  return actual * divisor
}
