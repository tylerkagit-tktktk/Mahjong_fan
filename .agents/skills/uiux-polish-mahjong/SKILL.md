---
name: uiux-polish-mahjong
description: Mahjong React Native app UI/UX 執靚 skill。專注排版、spacing、typography、顏色同一致性，做出接近 Apple 風格嘅簡潔介面。只改 UI，不動 business logic。
---

# uiux-polish-mahjong

## When to use

用呢個 skill 係要：

- 「執靚啲」、「再 premium 啲」、「似 Apple 啲」
- 排版覺得亂：text size/粗幼/顏色太多、行距唔一致
- spacing 唔舒服：太擠或太鬆、元素唔 align
- 顏色/陰影/圓角唔一致，成個 app 感覺唔統一
- 對 GameTable / Summary / Dashboard 呢啲主畫面做 visual 改良

呢個 skill 係 Mahjong 專用 design 指南，目標係：

- 少數、清晰嘅層級（標題 / 次標題 / body / caption）
- 穩定 spacing grid（例如 4 / 8 / 12 / 16 / 24）
- 柔和 card + 陰影，neutral 底色 + 明確主色（例如深綠）

## Non-goals / safety

- **唔改業務邏輯**：唔動計分、DB、dealer、路由、API。
- **唔大翻新**：偏好可 review 嘅細 diff，而唔係全面重寫 component。
- 唔加新 dependency（除非用戶要求），優先用現有 theme / component 庫。
- 唔改埋文案含義（只會建議排版/層次，如要改字要明講）。

## Default operating mode

1. **先鎖畫面範圍**
   - 問清楚或自己判斷：例「GameTableScreen」/「SummaryScreen」。
2. **列短計劃（<=5 點）**
   - 例如「統一 title 樣式」、「收緊規則卡 spacing」、「調整金額顏色」。
3. **按以下原則改：**
   - Spacing：用一致嘅 spacing scale（4/8/12/16/24），對齊 grid。
   - Typography：限定幾個字級 + fontWeight 組合；確保 lineHeight 好睇。
   - Color：保持背景簡單（淺米/白）、主色只用 1–2 個、輔助字色使用 theme secondary。
   - Components：button / tag / card 圓角、陰影、邊框粗幼保持一致。
4. **兼顧可用性**
   - 保持 hit area >= 44x44。
   - 文字對比度夠高（淺灰就用喺 caption，而唔係最重要資訊）。

## Checklist

- **排版**
  - Title 唔會同其他 body text 一樣大或一樣色。
  - 重要資訊（例如「東風東局」、「金額」）突出，次要資訊（例如「已打 X 鋪」）淡色。
- **Spacing**
  - 卡片內上下左右 margin 清晰，用固定 spacing 例如 12 / 16。
  - 不同 section 之間有合理距離，唔會擠到一團。
- **顏色**
  - 背景用 1 隻主色（例 `#F7F3EB` 類似），卡片白色，有輕微陰影。
  - 主按鈕用 app primary（深綠），次按鈕白底綠邊；文字色對比足夠。
  - 風位顏色、金額正負色使用固定 palette（唔隨手揀色）。
- **圓角 / 陰影**
  - Card / button 用一致 radius（如 16 / 20）。
  - 陰影輕身，唔會變成粗邊框。

## Output template (保持呢個順序)

1. **Plan**
   - 3–5 bullet，講清楚會改邊啲位（例如標題、規則卡、枱面 spacing、button 樣式）。
2. **Before → After (UI notes)**
   - 用 bullet 方式說明可見變化，例如：
     - Before：「規則文字一大段、無層次」
     - After：「拆成 4 粒 tag + 一行 caption，易掃視」
3. **Code changes (diffs)**
   - 貼出 relevant file diff（通常 1–3 個檔，如 `GameTableScreen.tsx`）。
   - 解釋重要 style key（font size、spacing、color）點解咁揀。
4. **How to verify (manual steps)**
   - 指導用戶用 iOS / Android 開幾個畫面，檢查字級、spacing、對齊、捲動。
5. **`git diff --stat`**
   - 提供一行 command，例如：
   `git diff --stat src/screens/GameTableScreen.tsx src/screens/SummaryScreen.tsx`
