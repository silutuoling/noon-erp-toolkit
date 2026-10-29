# noon-erp-toolkit

> 给 **Noon ERP** 与上架工具用的计算模块与费率数据（阿联酋 / 沙特 / 埃及三站）
>
> 由 [骆驼掌柜](https://noonmate.com) 维护 —— 一个专门给中国卖家做 Noon 上架与选品的工具站。

**What this is** — 13 zero-dependency calculation modules plus the underlying fee data,
for building a **Noon ERP**, a listing tool, or an internal cost model. Covers commission
tiers, FBN fees, pricing, profit, VAT, volumetric weight, freight allocation,
HS code structure, import duty, title rules, banned words, SKU variants and barcodes
across the UAE, Saudi Arabia and Egypt. Maintained by
[noonmate.com](https://noonmate.com), a toolset built for Chinese cross-border sellers.

**这不是一个 ERP。** 它不含订单、库存、物流对接，只专注一件事：算得对 ——
佣金阶梯、费用口径、税率、编码结构。把这些模块接进你自己的 Noon ERP 或表格，
省掉重新踩一遍口径坑的时间。

数据整理自 Noon 卖家帮助中心的公开服务附件，不是二手整理，也不代表 Noon。

---

## 这个仓库解决什么问题

网上关于 Noon 费用的资料大多有两个毛病：**数字过期**，或者**算法错**。

算法错得更隐蔽，也更伤钱。下面四个坑，这个仓库全都避开了。

### 1. 佣金是「边际阶梯」，不是整单一个百分比

Noon 官方原文：`N% for the portion of the total sales price up to X, M% for any portion greater than X`

以手表为例（阿联酋）：前 5,000 AED 收 15%，超出部分收 5%。

```
卖 8,000 AED 的正确佣金 = 5,000 × 15% + 3,000 × 5% = 900
按「整单一个百分比」算   = 8,000 × 5%             = 400
```

差 500 AED，一单。而且价格越高差距越大 —— 8,000 时有效费率是 11.25%，不是表面的 5%。
70 个类目里有 16 个是这种阶梯结构。

### 2. VAT 要从售价里「除」，不是「乘」

含税 133 AED、VAT 5%：

```
正确：不含税 = 133 ÷ 1.05 = 126.67
错误：133 − 133 × 5%      = 126.35
```

Noon 的佣金、广告费都按**不含税价**算。这一步错，后面全错。

### 3. 进口 VAT 的基数是「CIF + 关税」

```
关税 = CIF × 关税率
VAT  = (CIF + 关税) × VAT 率      ← 不是 CIF × VAT 率
```

而且进口 VAT 通常可抵扣 —— 它占你的现金流，但不该全额计入成本。
本仓库同时给两个口径，混用会让毛利凭空少一大截。

### 4. 加价率和毛利率不是一个东西

同一个 50%：

| 口径 | 公式 | 成本 100 的售价 |
|---|---|---|
| 加价率 50% | 成本 × 1.50 | 150 |
| 毛利率 50% | 成本 ÷ 0.50 | 200 |

差一倍。谈价时说「我要 50 个点」，两边理解的可能是不同数。

---

## 13 个模块

每个模块零依赖、clone 下来直接 `node` 就能跑。全部有对应的在线版（带界面、算例和导出）。

| 模块 | 工具 | 做什么 | 在线版 |
|---|---|---|---|
| `commission.mjs` | 佣金与费率库 | 70 个类目边际阶梯佣金 + FBN 出库费 | [打开](https://noonmate.com/tool/commission) |
| `profit.mjs` | 利润测算 | 单件净利、保本价、费用拆分（含 NGS 直发） | [打开](https://noonmate.com/tool/profit) |
| `pricing.mjs` | 反推定价 | 按目标加价率反推含税售价 | [打开](https://noonmate.com/tool/pricing) |
| `vat.mjs` | VAT 反算 | 含税价 ↔ 不含税价 | [打开](https://noonmate.com/tool/vat) |
| `fx.mjs` | 汇率换算 | AED / SAR / EGP / USD / CNY，含美元锚定反推 | [打开](https://noonmate.com/tool/fx) |
| `volumetric.mjs` | 体积重换算 | 体积重、计费重、装填率 | [打开](https://noonmate.com/tool/volumetric) |
| `freight.mjs` | 头程分摊 | 按件 / 按重量 / 按货值摊到单件 | [打开](https://noonmate.com/tool/freight) |
| `hs-code.mjs` | HS 编码校验 | 12 位结构解析，**不做归类** | [打开](https://noonmate.com/tool/hscode) |
| `import-duty.mjs` | 进口关税估算 | CIF → 关税 → VAT → 落地成本 | [打开](https://noonmate.com/tool/duty) |
| `title-check.mjs` | 标题规范检查 | 12 类问题检查与评分 | [打开](https://noonmate.com/tool/title) |
| `banned-words.mjs` | 违禁词自检 | 4 组 61 词风险表述扫描 | [打开](https://noonmate.com/tool/banned) |
| `sku-matrix.mjs` | SKU 变体矩阵 | 颜色 × 尺码批量出 SKU 并校验 | [打开](https://noonmate.com/tool/sku) |
| `barcode.mjs` | 条码标签 | EAN/UPC 校验位、Code128 规则、GS1 尺寸 | 暂未上线 |

> 两个例外：「选品分析」没有对应模块 —— 它依赖站外商品数据源，不是纯算法，抽出来没法独立运行。
> 「条码标签」模块可用，但该工具页还在内测，线上暂未开放，所以不挂链接。

---

## 用这些模块串一条 Noon ERP 的核算链

单个模块只解决一件事，串起来才是一条能用的流程。这就是一个 Noon ERP 在「上架前」该干的事：
一个从 1688 采来的商品，能不能做、卖多少钱、上架会被卡在哪。

完整可运行版本：`node examples/pipeline.mjs`

场景：1688 采一款蓝牙耳机，500 件发阿联酋，走 FBN。

| 环节 | 模块 | 这一步在防什么 |
|---|---|---|
| ① 编码结构 | `hs-code` | 位数或章号不对，后面税率全错 |
| ② 到岸成本 | `freight` | 运费摊错，便宜货被贵货拖死 |
| ③ 汇率 | `fx` | AED/SAR 直接取源值有偏差，要走美元锚定 |
| ④ 平台费用 | `commission` | 佣金按整单一个百分比算，少算一半 |
| ⑤ 净利 | `profit` | VAT 从售价里除，不能乘 |
| ⑥ 定价 | `pricing` | 反推价不含广告退货，照着上架就亏 |
| ⑦ 上架闸门 | `title-check` `banned-words` `sku-matrix` | 上架被拒，白等一轮审核 |

跑出来是这样：

```
② 到岸成本  按件 18.00 / 按重 15.75 / 按值 18.00 CNY   极差 13%
④ 平台费用  headphones：前 250 AED 15%，超出部分 8%
            售价 120 → 不含税 114.29 → 佣金 17.14（有效费率 15.0%）
            标准包裹 0.35kg，ASP > 25 → FBN 出库费 9.5 AED
⑤ 净利      114.29 − 17.14 − 9.50 − 5.71 − 4.57 = 77.36 AED ≈ 80.15 CNY
            毛利率 38.5% · 投入回报 131.9% · 保本价 59.20 AED
⑦ 上架闸门  ✓ 编码结构  ✓ 标题规范  ✓ 无违禁词  ✓ SKU 合规  ✓ 毛利达标 → 可以上架
```

### 一个必须知道的坑：反推定价和净利是两套口径

`pricing.priceFromMarkup()` 只扣**佣金和履约费**，不含广告与退货折损。
直接拿它算出的价上架，扣完广告退货后加价率会低一截。

同一个 50% 目标，两个口径差 9.4 AED：

| 目标加价率 | 工具口径（只含佣金履约） | 含广告与退货（真实） |
|---|---|---|
| 30% | 68.82 AED | 76.97 AED |
| 50% | 79.40 AED | 88.81 AED |
| 80% | 95.28 AED | 106.57 AED |

要得到「扣完所有费用后仍有 N% 加价」的价格，得把广告与退货并入扣减系数：

```js
// base = 到岸成本 + 履约费
// D    = 1 − 佣金率 − 广告率 − 退货率 × 退货折损率
const price = (base * (1 + markup) / D) * (1 + vat)
```

这个式子在本仓库里是可交叉验证的：令 `markup = 0`，算出来就是 `profit.localProfit()` 返回的
`breakEvenPrice`（示例里都是 59.20 AED）。两个模块对得上，说明口径没跑偏。

---

## 安装

```bash
npm i noon-erp-toolkit
```

零依赖，也可以直接 clone 下来用，不需要 `npm install`。

## 快速开始

```js
import { commission, profit, hsCode } from 'noon-erp-toolkit'

// 1. 手表卖 8,000 AED，佣金多少？（边际阶梯）
const fee = commission.referralFee(8000, commission.findTiers('watches', 'ae'), 1)
// → 900

// 2. 这单到底赚多少？（含税 105，VAT 5%，佣金 27%）
const p = profit.localProfit({
  price: 105, vatPct: 5, commissionPct: 27, fulfillLocal: 9,
  adPct: 5, returnRatePct: 8, costCny: 30, freightCny: 5, fx: 1.82,
})
// → p.netCny 净利（CNY）· p.marginPct 毛利 · p.breakEvenPrice 保本价

// 3. 这个 HS 码结构对不对？
hsCode.parseHsCode('610910001000', 'sa').status
// → 'ok'（只校验结构，不代表编码真实存在）
```

只想要某一个模块，可以走子路径，不会连带加载数据文件：

```js
import { referralFee } from 'noon-erp-toolkit/commission'
```

### 跑一遍全部模块

```bash
node examples/demo.mjs
```

会逐模块打印结果并跑 43 条断言，算错直接 FAIL 并以非零码退出。

---

## 数据来源

| 站点 | 官方来源 | 抓取日 |
|---|---|---|
| 阿联酋 AE | [FBN fees in UAE](https://helpcenter.noon.partners/en/category/fulfilled-by-noon-fbn/fulfilled-by-noon-fbn-fees-in-uae) | 2026-10-22 |
| 沙特 SA | [FBN fees in KSA](https://helpcenter.noon.partners/en/category/fulfilled-by-noon-fbn/fulfilled-by-noon-fbn-fees-in-ksa) | 2026-10-22 |
| 埃及 EG | [FBN fees in Egypt](https://helpcenter.noon.partners/en/category/fulfilled-by-noon-fbn/fulfilled-by-noon-fbn-fees-in-egypt) | 2026-10-22 |

费率会调整（AE/SA 的佣金与出库费 2026-09-10 生效，月度仓储 2026-10-01 生效，
埃及 2026-02-01 生效）。**任何实际结算以 Noon 官方页面和你的合同为准。**

---

## 目录结构

```
data/
  markets.json       三站元信息：VAT / 币种 / 仓储费 / 退货管理费 / 各表生效日
  referral-fees.json 70 个类目的佣金费率阶梯（三站独立）
  fbn-outbound.json  FBN 出库费，按尺寸档 × 重量档 × 售价档
  hs-rules.json      沙特/阿联酋/埃及的 HS 位数结构规则 + 97 章章节表
  duty-defaults.json 三站进口关税 / VAT / 服务费默认值与官方查询入口
  title-rules.json   16 个促销词 + 14 项检查规则与评分口径
  banned-words.json  4 组 61 个风险表述

src/                 13 个计算模块 + index.mjs 统一入口
examples/demo.mjs    逐模块演示 + 43 条自检断言
examples/pipeline.mjs 完整核算链：从编码校验到上架闸门
```

每个 JSON 都带 `_meta`，写明来源文件、抓取日、在线版地址和字段口径。

---

## 已知边界（重要）

这个仓库**有意不提供**一些东西，因为提供了反而会误导：

**① 不做 HS 编码归类。** `hs-code.mjs` 只校验编码**结构**（位数、是否全数字、章号范围），
不含任何「商品 → 编码」映射。归类是法律申报行为，同一产品因材质、用途、加工方式不同
可能落到不同编码，错报的后果是滞港、罚款、追税、退运。

而且 12 位编码**没有公开的统一校验位算法**，所以「结构合规」≠「编码真实存在」。

**② 只收录 FBN，不含 FBP。** FBP（卖家自发货）是另一套费率表，同站点同类目与 FBN 不同
（例：埃及个护 FBN 11.5% / FBP 13.5%）。

**③ 不含品牌专属费率。** 官方把品牌级例外放在单独的 Excel 例外表里，我们只收了通用表。

**④ 不内置汇率快照。** 汇率每天变，静态值会误导。`fx.mjs` 只提供换算算法和美元锚定反推。

**⑤ 费率不含 VAT。** 官方明确 "All fees are exclusive of VAT"。要算含税落地成本，
VAT 必须单独叠加（AE 5% / SA 15% / EG 14%）。

**⑥ 违禁词库不构成合规判定。** 命中不代表一定违规，未命中也不代表一定合规。
平台政策随时变化，以 Noon 官方商品政策为准。

---

## 数据更新

这些 JSON 不是手抄的，是从工具站的真源代码自动导出的 —— 手抄两遍必然会对不上。
如果你发现某个数字和 Noon 官方页面不一致，**以官方页面为准**，并欢迎开 issue 指出来。

---

## 许可

- **代码**（`src/`、`examples/`）：MIT
- **数据**（`data/`）：CC BY 4.0，使用时请注明来源

数据原始版权归 Noon 所有，本仓库仅做结构化整理。

---

维护：[骆驼掌柜](https://noonmate.com) · 问题反馈请开 issue
