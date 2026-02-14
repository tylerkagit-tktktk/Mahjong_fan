# EOD Cleanup Skill

Purpose:
Standardized end-of-day cleanup workflow to maintain code quality, architecture clarity, and clean git history.

---

## Steps

### 1. Code Review
- Identify unused / dead code.
- Remove unreachable logic.
- Remove legacy fields not used anymore.
- Keep only meaningful, referenced code.
- Do NOT change business logic.

### 2. Cleanup / Refactor
- Remove outdated patterns replaced today.
- Unify duplicated logic.
- Simplify conditionals if possible.
- No behavior change allowed.

### 3. i18n Audit
- Scan for hardcoded strings in UI.
- Move user-facing text into i18n layer.
- Do NOT modify dynamic data labels (e.g., roundLabelZh from engine).

### 4. Tests
- Run related tests.
- Ensure no regression.
- If refactor requires minor test adjustment, update tests.

### 5. Git Discipline
- Run:
  - `git status`
  - `git diff --stat`
  - `git diff`
- Analyze changes.
- Split commits by change type if mixed.
- Use correct conventional commit prefix:
  - feat:
  - fix:
  - refactor:
  - chore:
  - test:
- Commit message must reflect actual change.
- `git push`

### 6. Commit Message Integrity
- Before writing commit title, summarize actual scope from:
  - changed files (`git diff --stat`)
  - key hunks (`git diff`)
- Commit title must use real type: `feat` / `fix` / `refactor` / `chore` / `test` / `docs`.
- If one batch includes multiple themes (e.g. i18n + refactor + tests), split into multiple commits first.

### 7. Commit Grouping Rules
- dev guard / `isDev` normalization → `refactor: ...`
- seed/demo cleanup → `chore: ...`
- i18n string replacement → `i18n: ...` or `feat(i18n): ...` (follow repo convention)
- tests add/fix → `test: ...`
- schema / DB migration → `chore(db): ...` or `fix(db): ...`

### 8. Safety Rules For Titles
- Do NOT use `eod-cleanup` as commit title unless changes are cleanup-only with zero behavior change.
- If behavior changed (e.g. `insertHand`, round label, schema), title must include that scope explicitly.

---

## Rules

- No new features.
- No schema changes.
- No logic changes.
- Only cleanup and quality improvement.
- Preserve behavior.

---

## Output Format

Provide:
- Summary of removed code
- Summary of refactors
- Summary of i18n fixes
- Test result
- Git commit messages created

---

## EOD Checklist

- Verify lint:
  - `npx eslint <changed files>`
- Verify tests:
  - `npx jest <related tests> --runInBand`
- If demo seed touched: verify seed path runs without error.
- Manual smoke check:
  - create game
  - add hand
  - end game
