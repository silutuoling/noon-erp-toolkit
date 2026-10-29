/**
 * sku-matrix.mjs —— SKU 变体矩阵生成
 *
 * 颜色 × 尺码 → 批量出合规 SKU。看着简单，但一次性上架几百个变体时，
 * 手写几乎必然出错：重复、超长、带空格、带非法符号，后台会一条条报错。
 *
 * 本模块边生成边校验，输出每一行的问题清单：
 *   · 超出字符上限      （后台通常 16 位左右，按你的类目调）
 *   · 含空格            （Noon 的 SKU 不留空格）
 *   · 含禁用符号        （+ / % & 这几个官方点名避免）
 *   · 为空
 *   · 与其它 SKU 重复   （最常见的批量错误）
 *
 * 🔴 SKU 一旦用于上架就不要改 —— 改了等于换了个商品，
 *    历史销量、评价、库存记录都会断开。所以生成阶段就要确认好规则。
 *
 * 在线版（可导出 CSV）：https://noonmate.com/tool/sku
 */

/** 单次生成上限，防止把浏览器或表格卡死 */
export const MAX_ROWS = 500

/**
 * 生成 SKU 矩阵。
 *
 * @param {object} p
 * @param {string} p.dim1 第一维取值，逗号/空格/分号分隔（如 "Red,Blue,Black"）
 * @param {string} p.dim2 第二维取值（如 "S,M,L,XL"）
 * @param {string} [p.prefix] SKU 前缀
 * @param {string} [p.suffix] SKU 后缀
 * @param {'-'|'_'|''} [p.sep='-'] 连接符
 * @param {'keep'|'upper'|'lower'} [p.letterCase='keep']
 * @param {number} [p.maxLen=16] 字符上限
 * @returns {{rows:Array<{sku:string,label:string,problems:string[]}>, bad:number, total:number, truncated:boolean}}
 */
export function buildMatrix({
  dim1 = '',
  dim2 = '',
  prefix = '',
  suffix = '',
  sep = '-',
  letterCase = 'keep',
  maxLen = 16,
}) {
  const parse = (s) =>
    String(s)
      .split(/[,，\s;]+/)
      .map((x) => x.trim())
      .filter(Boolean)

  const a = parse(dim1)
  const b = parse(dim2)
  const lim = Math.max(parseInt(maxLen, 10) || 16, 4)
  const pre = String(prefix).trim()
  const suf = String(suffix).trim()

  const listA = a.length > 0 ? a : ['']
  const listB = b.length > 0 ? b : ['']

  const rows = []

  outer: for (const va of listA) {
    for (const vb of listB) {
      if (rows.length >= MAX_ROWS) break outer

      const parts = [pre, va, vb, suf].filter(Boolean)
      let sku = parts.join(sep)
      if (letterCase === 'upper') sku = sku.toUpperCase()
      if (letterCase === 'lower') sku = sku.toLowerCase()

      const label = [va, vb].filter(Boolean).join(' / ') || '默认'
      const problems = []

      if (sku.length > lim) problems.push(`超出 ${lim} 字符`)
      if (/\s/.test(sku)) problems.push('含空格')
      if (/[+/%&]/.test(sku)) problems.push('含禁用符号')
      if (!sku) problems.push('为空')

      rows.push({ sku, label, problems })
    }
  }

  /* 重复检测 */
  const seen = new Map()
  for (const row of rows) seen.set(row.sku, (seen.get(row.sku) ?? 0) + 1)
  for (const row of rows) {
    if ((seen.get(row.sku) ?? 0) > 1 && !row.problems.includes('与其它 SKU 重复')) {
      row.problems.push('与其它 SKU 重复')
    }
  }

  return {
    rows,
    bad: rows.filter((x) => x.problems.length > 0).length,
    total: rows.length,
    truncated: rows.length >= MAX_ROWS,
  }
}

/** 导出成 CSV 文本（带 BOM，Excel 打开不乱码） */
export function toCsv(rows) {
  const head = 'SKU,变体,问题'
  const body = rows.map((r) => [r.sku, r.label, r.problems.join('；')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  return '\ufeff' + [head, ...body].join('\n')
}
