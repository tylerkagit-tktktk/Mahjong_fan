---
name: nav-safearea-mahjong
description: React Navigation + Safe Area 一致性修正（Mahjong app 專用）。用於處理 header / tab bar / safe area 相關 layout 問題，不改 route 結構。
---

# nav-safearea-mahjong

## When to use

用呢個 skill 嚟處理所有「畫面被 header/tab bar / notch 夾住」或者「背景色唔一致」嘅情況，包括：

- header 背景色同畫面底色唔同步（頂部出現怪色帶）
- content 捲動時被 header 遮住／穿過 status bar
- tab bar / 底部 safe area padding 時多時少
- iOS / Android safe area 表現唔一致
- ScrollView / FlatList 嘅內容頂住 notch 或者被底部按鈕遮住

常見 keyword：
>「safe area 問題」
>「頂部被遮住」
>「header 背景唔同色」
>「底部留白怪怪地」
>「唔想可以 scroll 到 header 後面」

## Non-goals / safety

- **唔改 navigation 結構**：唔好改 route 名、唔好搬 screen 去其他 navigator，除非用戶明確要求。
- **唔加大型 refactor**：盡量用最少改動解決（style、容器結構、SafeAreaView 用法）。
- **唔亂動 business logic**：專注 layout / safe area，唔改 state、API、計分邏輯。

## Preferred approach (2025 版)

1. **了解現況**
   - 睇 `RootNavigator` / `Stack` / `Tab` 點 setup。
   - 搵出 screen container 共通 pattern（例如全部都用 `<ScreenContainer>` 或 `<SafeAreaView>`）。

2. **統一 safe area 策略**
   - 如果已用 `react-native-safe-area-context`：
     - 優先用 `useSafeAreaInsets()` + `paddingTop/paddingBottom` 控制。
   - 頂層 screen：
     - 外層用一個 `View` / `SafeAreaView` 包住，`backgroundColor` = app surface。
     - React Navigation header 設 `headerStyle: { backgroundColor: theme.colors.surface }`。

3. **處理可捲動內容**
   - ScrollView / FlatList：
     - 用 `contentContainerStyle` 加 `paddingBottom` = `bottom inset + footer height`。
     - 盡量避免 ScrollView 再包 SafeAreaView 造成 double padding。
   - 固定底部按鈕：
     - 讓 main content `flex: 1`，footer 獨立一個區塊，加 `paddingBottom: insets.bottom + spacing`。

4. **平台一致性**
   - iOS：
     - 確認 `headerTransparent` / `headerBlurEffect` 時，有額外 top padding。
   - Android：
     - 如使用 `StatusBar` `translucent`，記得手動加 top inset 到 root container。

## Checklist

- Header：
  - `headerStyle.backgroundColor` 同畫面背景一致／刻意對比但有設計理由。
  - title、back button 清晰可見（根據深淺色選擇 `barStyle`）。
- Safe Area：
  - 內容冇被 notch / home indicator 遮住。
  - 頂/底 padding 唔「多一截又唔知點解」。
- Scroll：
  - 向上捲唔會令 content 藏喺 header 後面（除非真係想要 translucent 效果）。
  - 向落捲到底部時，最後一項唔會被 tab bar / 按鈕完全蓋住。
- Tab / footer：
  - tab bar + 底部按鈕 spacing 一致。
  - Android / iOS 表現一致，不會一邊多一截白邊。

## Output template

1. **Diagnosis** – 解釋而家邊啲位 safe area / header / footer 有問題（附簡短原因）。
2. **Fix strategy** – 用 2–4 點講清楚改法，強調「最小可行改動」。
3. **Patch / diffs** – 提供精簡 diff 或修改片段（集中係 container / headerStyle / safe area 用法）。
4. **Verification steps** – iOS + Android 分別點測（例如：啟動 app → 進入 GameTable → 捲到最底）。
5. **`git diff --stat`** – 只提供 command，例如：
   `git diff --stat src/navigation/RootNavigator.tsx src/screens/GameTableScreen.tsx`
