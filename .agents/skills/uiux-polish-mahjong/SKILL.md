---
name: uiux-polish-mahjong
description: React Native Mahjong app UI/UX polish. Use for “執靚啲/排版/spacing/typography/color/theme consistency”, Apple-like minimalist look. Do not change business logic. Prefer small, safe diffs. Provide before/after notes + diffstat.
---

# uiux-polish-mahjong

## When to use
Use this skill when the user asks to polish UI/UX, make screens look cleaner, improve spacing, visual hierarchy, typography, color usage, or component consistency.

Typical triggers: “執靚啲”, “更 Apple”, “visual polish”, “spacing”, “typography”, “consistency”, “make it look premium”, “UI messy”.

## Non-goals / safety
- Do not change business logic, data flow, navigation logic, or API contracts unless explicitly asked.
- Do not introduce new dependencies unless explicitly asked.
- Keep diffs small and reviewable; avoid sweeping refactors.

## Default operating mode
1) Ask at most 1 clarification only if truly needed (e.g., which screen/which design direction).
2) Produce a short plan (max 5 bullets).
3) Make changes with a bias toward:
    - Consistent spacing scale (e.g., 4/8/12/16/20/24)
    - Fewer font sizes; clearer hierarchy (title / section / body / caption)
    - Reduced visual noise (less borders; more whitespace)
    - Consistent colors (neutral background, consistent primary accent)
    - Consistent radius/shadow usage (subtle)
4) Output:
    - “Before → After” bullet list describing visible improvements
    - Any tradeoffs
    - A small patch (or file diffs)
    - `git diff --stat` suggestion at the end

## Checklist
- Spacing: consistent margins/padding; align to grid; remove arbitrary values.
- Typography: consistent font sizes/weights; ensure lineHeight; reduce mixed styles.
- Color: ensure contrast; avoid too many grays; unify background/surface.
- Components: unify button styles, input styles, card/list rows.
- Empty/loading states: ensure they look intentional.
- Touch targets: ensure minimum comfortable hit area.
- iOS feel: use softer shadows, lighter separators, less heavy borders.

## Output template (use this order)
1) Plan
2) Before → After (UI notes)
3) Code changes (diffs)
4) How to verify (manual steps)
5) `git diff --stat` (command only)
