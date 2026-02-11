---
name: hk-scoring-traditional
description: 香港麻雀「傳統番數」計算專用 skill。負責定義/維護 full-gun / half-gun 各種注碼（二五雞、五一、一二蚊）嘅番數 → 收費表，同埋相關 Jest 測試。只改計分 engine，不改 UI/路由/DB。
---

# hk-scoring-traditional

## When to use

只要遇到以下情況，就用呢個 skill：

- 要檢查 / 修改 **香港傳統番數** 計法：
  - fullGun / halfGun
  - stake preset：二五雞（TWO_FIVE_CHICKEN）/ 五一（FIVE_ONE）/ 一二蚊（ONE_TWO）
  - settlementType：自摸 (`zimo`) / 出銃 (`discard`)
- 建立 / 更新 **番數 → 收費表 paytable**（0–10 番 或以上）
- 為 HK 模式新增或修正 **Jest 測試**，確保：
  - 數值符合價目表
  - fullGun / halfGun 行為正確
  - zimo / discard 行為正確
  - deltasQ 總和 = 0（zero-sum）

常見 keyword：
> 「傳統番數」、「full gun / half gun」、「二五雞」、「五一」、「一二蚊」、「計錯數」、「自摸出銃點樣計」。

## Non-goals / safety

- **唔處理 UI**：唔改 GameTableScreen 排版、顏色、字體。
- **唔改 DB schema / API**：只可以用現有 model（RulesV1、hand、settlement 結構）。
- **唔加入新 scoring 模式**（例如日本麻雀、自訂 table）除非 user 明確講要。
- 唔改唔相關嘅 Jest 測試（例如其他地區、非 HK 模式），除非真係被你發現有 bug。

## Core concepts（統一定義）

1. **Stake preset**
   - `TWO_FIVE_CHICKEN` = 二五雞（0 番起跳 $0.5）
   - `FIVE_ONE`        = 五一   （0 番起跳 $1.0）
   - `ONE_TWO`         = 一二蚊（0 番起跳 $2.0）

2. **Gun mode**
   - `fullGun`  = 全銃制（放銃者一力承擔）
   - `halfGun`  = 半銃制（放銃者付多、其餘兩家亦要付）

3. **Settlement type**
   - `zimo`    = 自摸，三家付款
   - `discard` = 出銃，至少有一個放銃者；fullGun 情況只得一個付款者

4. **Fan range**
   - 主要關心 `0..10` 番：
     - `0 番 → 0.5 / 1 / 2` 起跳
     - `5 番` = 半辣
     - `8 番` = 例牌
     - `10 番` = 頂
   - `>10` 一律按 `10 番` 處理（爆棚上限）。

## Invariants（不可破壞的規則）

寫 engine / 測試時 **一定要滿足**：

1. **數值要跟價目表**
   - 對應二五雞 / 五一 / 一二蚊嘅價目表：
     - 每個 fan（0..10）都有：
       - 自摸一位付（per-seat）
       - 自摸總收
       - 出銃（放銃者付）
       - 出銃（其餘兩家各付）
       - 出銃總收
   - fullGun / halfGun 嘅計算都要可以推導回到呢個表。

2. **Zero-sum**
   - `deltasQ[0] + deltasQ[1] + deltasQ[2] + deltasQ[3] === 0` 必須成立。

3. **source 一致**
   - 只要 `rules.hk.scoringPreset === 'traditionalFan'`：
     - 不論 gunMode / stakePreset / settlementType，全部要由 `computeSettlementHkV1` 計出。
     - `computeHkSettlement` 不可以再 fallback 去 `computeCustomPayout`。

4. **Zimo 行為**
   - zimo 時，一定係「三家付」，但每家付款額根據 fullGun / halfGun 規則：
     - fullGun：三家都付「出銃總收 ÷ 3」或價目表所定。
     - halfGun：沿用現行 v1 規則（放銃者付最多，但此邏輯已固定在 v1 中）。

## Recommended workflow

1. **理解價目表**
   - 先根據用戶提供嘅價目表（例如 markdown / 圖片）抄成程式用嘅結構（object 或 map），確保人眼檢查一次。
   - 逐個 stake preset（25/50/100 cents base）建立 `fan` → 單位金額表。

2. **實作 helper**
   - `normalizeTraditionalFan(rawFan)`：將番數 clamp 去 `0..10`。
   - `getTraditionalHalfGunPaytable(stakePreset, fan)`：
     - 回傳一個結構，入面至少包括：
       - `zimoPerSeat`
       - `zimoTotal`
       - `discardFromLoser`
       - `discardFromOthers`
       - `discardTotal`

3. **在 computeSettlementHkV1 裏面使用 paytable**
   - 根據：
     - gunMode（fullGun/halfGun）
     - settlementType（zimo/discard）
     - winnerSeatIndex 是否莊家
   - 計出 `deltasQ: [number, number, number, number]`（以 quarter 為單位）：
     - 正數 = 收錢
     - 負數 = 付錢

4. **寫 Jest 測試（重點）**
   - 建議至少有以下幾個檔案：
     - `hk_traditional_allFans_paytable.test.ts`
       - 對 `fan = 0..10`、三個 stake preset、halfGun 做 sweep test。
     - `hk_fullGun_traditional_zimo_twoFiveChicken.test.ts`
       - 釘死 fullGun + zimo + 10 番（二五雞）經典例子。
     - `hk_halfGun_traditional_zimo_twoFiveChicken.test.ts`
       - 釘死 halfGun + zimo + 10 番（二五雞）行為。
     - `hk_traditional_zimo_otherStakePresets.test.ts`
       - FIVE_ONE / ONE_TWO 嘅 smoke test，確保 route/source 正確、zero-sum。

## Checklist（完成前自我檢查）

- [ ] `computeHkSettlement` 入面，traditionalFan case 全部走 `computeSettlementHkV1`。
- [ ] 每個新增測試檔都：
  - [ ] 至少包含一個 zimo case + 一個 discard case。
  - [ ] 檢查 deltasQ 是否 zero-sum。
- [ ] 價目表關鍵 fan（0 / 1 / 2 / 3 / 4 / 5 / 8 / 10 番）嘅數值與人手表格一致。
- [ ] `npx jest` 對相關測試檔全部 PASS。
- [ ] `npx eslint` 對修改檔案無 error / warning。

## Output template（回答格式）

1. **Summary**
   - 一句話解釋：今次係修正 / 強化邊一部份嘅香港傳統番數計法。
2. **Files changed**
   - 用 bullet 列出實際有改動嘅檔案。
3. **Engine changes**
   - 簡述 `computeSettlementHkV1` / `computeHkSettlement` 入面邏輯點樣更新。
   - 強調有遵守 invariants（價目表、zero-sum、routing）。
4. **Tests**
   - 列出新增/更新嘅 Jest 測試檔，描述每個檔主要 cover 咩情境。
   - 貼出已成功執行嘅 `npx jest ...` 同 `npx eslint ...` 指令。
5. **Next steps（可選）**
   - 如有需要，建議未來可以再加嘅測試（例如莊家/閒家邊界 case、fan=0 特例等）。
