/**
 * banned-words.mjs —— 违禁词与敏感表述自检
 *
 * 4 组共 61 个词：绝对化用语 / 医疗功效宣称 / 仿冒相关表述 / 疑似品牌词。
 * 匹配方式是**不区分大小写的子串匹配**，命中即列为风险。
 *
 * 🔴 三条边界，用之前必须看清：
 *   1. 这个词库是「公开常见风险表述的整理」，**不构成合规判定**。
 *      命中不代表一定违规，未命中也不代表一定合规。
 *   2. 平台政策随时变化。词库有滞后，**以 Noon 官方商品政策为准**。
 *   3. 最高频的踩坑方式不是生僻词，是「绝对化」和「医疗功效」——
 *      "best seller"、"100%"、"kills 99.9%" 这类词在标题和详情页里非常常见。
 *
 * 实际使用建议：在本地追加你自己历史被打回的词，比通用词库更有价值。
 *
 * 在线版（可在浏览器里追加自定义词库）：https://noonmate.com/tool/banned
 */

import { readFileSync } from 'node:fs'

const DATA = JSON.parse(
  readFileSync(new URL('../data/banned-words.json', import.meta.url), 'utf8')
)

/** 分组词库：[{ key, label, level, tip, words }] */
export const GROUPS = DATA.groups

/**
 * 扫描一段文本。
 *
 * @param {string} text 标题 / 描述 / 图片文案
 * @param {object} [opts]
 * @param {string[]} [opts.custom] 你自己追加的词
 * @param {'all'|'high'} [opts.only='all'] 只报 high 级
 * @returns {{word:string, group:string, label:string, level:string, tip:string}[]}
 */
export function scan(text, { custom = [], only = 'all' } = {}) {
  const t = String(text).toLowerCase()
  const out = []

  for (const g of GROUPS) {
    if (only === 'high' && g.level !== 'high') continue
    for (const w of g.words) {
      if (w && t.includes(w.toLowerCase())) {
        out.push({ word: w, group: g.key, label: g.label, level: g.level, tip: g.tip })
      }
    }
  }

  for (const w of custom) {
    if (w && t.includes(w.toLowerCase())) {
      out.push({
        word: w,
        group: 'custom',
        label: '自定义词库',
        level: 'mid',
        tip: '你自己维护的词。',
      })
    }
  }

  /* 同一个词可能同时命中多组（例如 "best" 在绝对化和品牌组），去重保留第一条 */
  const seen = new Set()
  return out.filter((h) => {
    const k = h.word.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 只回答「有没有高风险词」，用于批量筛查列表 */
export function hasHighRisk(text, custom = []) {
  return scan(text, { custom, only: 'high' }).length > 0
}
