/**
 * index.mjs —— 统一入口 + 工具清单
 *
 * 13 个模块对应 Noon 卖家上架链路里的 13 个计算环节。
 * 每个模块都是零依赖、可直接 node 运行，clone 下来就能用。
 *
 * 唯一没有对应模块的是「选品分析」—— 它依赖站外商品数据源，
 * 不是纯算法，抽出来也没法独立运行，所以不放。
 *
 * 在线版（带界面、算例和导出）：https://noonmate.com/tool
 */

export * as commission from './commission.mjs'
export * as pricing from './pricing.mjs'
export * as profit from './profit.mjs'
export * as vat from './vat.mjs'
export * as fx from './fx.mjs'
export * as volumetric from './volumetric.mjs'
export * as freight from './freight.mjs'
export * as hsCode from './hs-code.mjs'
export * as importDuty from './import-duty.mjs'
export * as titleCheck from './title-check.mjs'
export * as bannedWords from './banned-words.mjs'
export * as skuMatrix from './sku-matrix.mjs'
export * as barcode from './barcode.mjs'

/**
 * 模块 ↔ 在线工具对照表。
 * live=false 表示该工具页暂未上线，只有模块、没有在线版。
 */
export const TOOLS = [
  { slug: 'profit', module: 'profit.mjs', name: '利润测算', desc: '单件净利、保本价、费用拆分', live: true },
  { slug: 'pricing', module: 'pricing.mjs', name: '反推定价', desc: '按目标加价率反推含税售价', live: true },
  { slug: 'vat', module: 'vat.mjs', name: 'VAT 反算', desc: '含税价 ↔ 不含税价', live: true },
  { slug: 'commission', module: 'commission.mjs', name: '佣金与费率库', desc: '70 个类目边际阶梯佣金 + FBN 出库费', live: true },
  { slug: 'fx', module: 'fx.mjs', name: '汇率换算', desc: 'AED / SAR / EGP / USD / CNY，含美元锚定', live: true },
  { slug: 'volumetric', module: 'volumetric.mjs', name: '体积重换算', desc: '体积重、计费重、装填率', live: true },
  { slug: 'freight', module: 'freight.mjs', name: '头程分摊', desc: '按件 / 按重量 / 按货值摊到单件', live: true },
  { slug: 'hscode', module: 'hs-code.mjs', name: 'HS 编码校验', desc: '12 位结构解析，不做归类', live: true },
  { slug: 'duty', module: 'import-duty.mjs', name: '进口关税估算', desc: 'CIF → 关税 → VAT → 落地成本', live: true },
  { slug: 'title', module: 'title-check.mjs', name: '标题规范检查', desc: '12 类问题检查与评分', live: true },
  { slug: 'banned', module: 'banned-words.mjs', name: '违禁词自检', desc: '4 组 61 词风险表述扫描', live: true },
  { slug: 'sku', module: 'sku-matrix.mjs', name: 'SKU 变体矩阵', desc: '颜色 × 尺码批量出 SKU 并校验', live: true },
  { slug: 'barcode', module: 'barcode.mjs', name: '条码标签', desc: 'EAN/UPC 校验位、Code128 规则、GS1 尺寸', live: false },
]

/** 在线工具地址；未上线的返回 null */
export function toolUrl(slug) {
  const t = TOOLS.find((x) => x.slug === slug)
  return t && t.live ? `https://noonmate.com/tool/${slug}` : null
}
