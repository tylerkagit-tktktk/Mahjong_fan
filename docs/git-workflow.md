# Git Branch Workflow（Mahjong_fan）

## 分支角色定義

- `dev_1.0`：日常開發分支。所有功能開發、重構、測試調整都先在這裡進行，並保持 `lint` / `test` 通過。
- `uat`：驗收分支。由 `dev_1.0` merge 過來，用於接近真實環境（User Acceptance Test）測試。
- `prd`：發版準備分支。由 `uat` merge 過來，代表「準備出街」版本。
- `master`：正式出街分支。只可以由 `prd` merge，並且應永遠與 `prd` 一致。

## 正常開發流程（固定順序）

1. 在 `dev_1.0` 開發、commit、push。
2. 完成一輪開發後，從 `dev_1.0` merge 到 `uat`，push `uat`，並在 `uat` 進行驗收測試。
3. 驗收 OK 後，從 `uat` merge 到 `prd`，再 push `prd`。
4. 由 Tyler 最終確認可以出街後，才從 `prd` merge 到 `master`，並 push `master`。

## Hotfix 流程（簡版）

- 如在 `prd` 或 `master` 發現問題，修正仍需走同一條主流程：
  `dev_1.0` → `uat` → `prd` → `master`
- 不直接在 `master` 做修正開發，避免流程分叉與版本漂移。

## 必守規則

- 不使用 force push（`git push --force` / `--force-with-lease`）。
- merge 順序固定：`dev_1.0` → `uat` → `prd` → `master`。
- `master` 不作直接開發（no direct feature work on `master`）。

