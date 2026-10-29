/**
 * freight.mjs —— 头程运费分摊（整批费用摊成单件到岸成本）
 *
 * 一批货的运费 + 关税 + 杂费是整批付的，但要算单件利润，必须摊到每一件上。
 * 三种摊法在小批量、多 SKU 的批次里结果能差一倍：
 *
 *   按件均摊  → 按数量平分，适合重量和货值都接近的同质品
 *   按重量摊  → 按重量占比，适合重货（大件家具、五金）
 *   按货值摊  → 按货值占比，适合高单价轻货（珠宝、电子）
 *
 * 摊错会直接错杀产品线：用按件均摊摊高单价商品，会把便宜货的运费算到贵的头上。
 *
 * 在线版：https://noonmate.com/tool/freight
 */

export const BASES = ['qty', 'weight', 'value']

/**
 * @param {object} p
 * @param {number} p.freight 整批运费（CNY）
 * @param {number} [p.duty] 整批关税（CNY）
 * @param {number} [p.misc] 整批杂费（CNY）
 * @param {number} p.totalQty 整批件数
 * @param {number} p.totalWeight 整批总重量（kg）
 * @param {number} p.totalValue 整批货值（CNY）
 * @param {number} p.unitWeight 单件重量（kg）
 * @param {number} p.unitCost 单件采购成本（CNY）
 * @param {'qty'|'weight'|'value'} [p.basis='qty'] 分摊基准
 * @returns {{total:number, byQty:number, byWeight:number, byValue:number, picked:number, unitCost:number, landed:number, basis:string}}
 *   landed = 单件到岸成本 = 单件采购成本 + 摊到的费用
 */
export function allocate({
  freight = 0,
  duty = 0,
  misc = 0,
  totalQty = 0,
  totalWeight = 0,
  totalValue = 0,
  unitWeight = 0,
  unitCost = 0,
  basis = 'qty',
}) {
  const total = freight + duty + misc

  const byQty = totalQty > 0 ? total / totalQty : 0
  const byWeight = totalWeight > 0 ? (total / totalWeight) * unitWeight : 0
  const byValue = totalValue > 0 ? (total / totalValue) * unitCost : 0

  const picked = basis === 'weight' ? byWeight : basis === 'value' ? byValue : byQty

  return {
    total,
    byQty,
    byWeight,
    byValue,
    picked,
    unitCost,
    landed: unitCost + picked,
    basis,
  }
}

/**
 * 三种摊法同时算一遍，用来判断「换基准会不会明显改变结论」。
 * 差异超过 20% 说明这批货结构不均衡，摊法选择很关键。
 * @returns {{...result, spread:number}} spread 为三种摊法的极差占中位数的百分比
 */
export function compareBases(input) {
  const qty = allocate({ ...input, basis: 'qty' })
  const weight = allocate({ ...input, basis: 'weight' })
  const value = allocate({ ...input, basis: 'value' })
  const picks = [qty.picked, weight.picked, value.picked].filter((n) => n > 0).sort((a, b) => a - b)
  const mid = picks[Math.floor(picks.length / 2)] || 0
  return {
    qty,
    weight,
    value,
    spread: mid > 0 ? ((picks[picks.length - 1] - picks[0]) / mid) * 100 : 0,
  }
}
