# Long Session Smoke Checklist

## Scope
驗證長時間對局下，對局流程、狀態、進度顯示與歷史展示保持穩定。

## Checklist
- [ ] 建立新對局，連續記錄 200 手（混合自摸/點炮/流局）。
- [ ] 覆蓋流局行為：番莊與過莊都至少一次。
- [ ] 覆蓋四圈後提示：選擇不執位 / 重新執位各一次。
- [ ] 驗證進行中局風顯示持續正確（東/南/西/北）。
- [ ] 對局結束後自動進入 GameDashboard（只讀）。
- [ ] History 顯示進行中/已結束/已放棄分組與狀態正確。
- [ ] 關閉並重開 App，確認對局與局風標籤持久化正確。
- [ ] 測試分享輸出：純文字與摘要卡片內容可讀，無 JSON 暴露。
- [ ] DEV 備份/還原：新增幾手後還原最近備份，資料可回復。

## Optional deterministic sim
- 使用 tx-mock 跑 50 手 deterministic integration test，確認 zero-sum 與局風推進一致。
