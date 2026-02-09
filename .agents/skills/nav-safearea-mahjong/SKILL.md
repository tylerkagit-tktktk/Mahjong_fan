---
name: nav-safearea-mahjong
description: React Navigation + Safe Area consistency for Mahjong app. Use for “header/tab bar background mismatch”, “safe area top/bottom”, “status bar overlay”, “scroll behind header”, “notch padding”. Keep navigation behavior unchanged; focus on layout + styling.
---

# nav-safearea-mahjong

## When to use
Use this skill for navigation chrome + safe area issues:
- Header background color differs from screen background
- Tab bar / bottom safe area spacing inconsistent
- Content clipped under notch/status bar
- ScrollView content hidden behind header/tab bar
- iOS/Android differences with insets

Triggers: “safe area”, “notch”, “status bar”, “header 背景”, “tab bar 背景”, “頂部被遮住”, “底部留白怪”.

## Non-goals / safety
- Do not alter route structure, screen names, or navigation logic unless explicitly asked.
- Avoid refactors; fix with minimal changes (theme, container styles, SafeAreaView usage).

## Preferred approach
1) Identify current navigation setup (RootNavigator / Stack / Tabs) and screen container patterns.
2) Pick one consistent pattern and apply narrowly:
    - Use `react-native-safe-area-context` insets if already present.
    - Ensure root screen container has consistent `backgroundColor`.
    - Ensure header style matches screen background (or deliberate contrast).
3) If a screen uses ScrollView/FlatList:
    - Prefer `contentContainerStyle` paddingTop/paddingBottom to avoid overlap.
    - Avoid double-padding when SafeAreaView already handles it.

## Checklist
- Header: `headerStyle.backgroundColor` matches app surface.
- Status bar: ensure readable (light/dark) and background behavior is intentional.
- Top inset: avoid content under notch; consistent across screens.
- Tab bar: consistent background and bottom inset handling.
- Modal/transparent header: verify content offset.
- Android: check extra padding or translucent status bar behavior.

## Output template
1) Diagnosis (what was wrong)
2) Fix strategy (minimal)
3) Patch / diffs
4) Verification steps (iOS + Android)
5) `git diff --stat` (command only)
