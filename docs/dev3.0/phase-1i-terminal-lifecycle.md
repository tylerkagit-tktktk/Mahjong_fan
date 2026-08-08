# dev3.0 Phase 1I — Permanently Terminal Ended Games

## Product outcome

Local games now follow a one-way lifecycle:

```text
draft (first-hand setup) → active (record / correct / undo) → ended (read-only)
                                                        └──→ abandoned (read-only)
```

An explicit End Game confirmation locks the result. Ended and abandoned games cannot record another hand, correct or undo the last hand, reseat, resume play, or reopen.

## Superseded reopen work

Phase 1F's `ended → active` reopen implementation and Phase 1G's Dashboard reopen UI are superseded. Phase 1I removes the reopen planner, availability selector, repository mutation, Dashboard action/state, dedicated tests, and localized reopen strings.

The product framing is now **「可信牌局：可修正、可追溯、可分享」**. The older **「可修正、可復原、可帶走」** wording is historical only.

## Schema-303 compatibility

Schema remains at `303`; no migration, table drop, or data rewrite is introduced. `game_lifecycle_revisions`, lifecycle snapshots, the historical `'reopen'` action type, and `getGameLifecycleRevisions` remain read-compatible with existing development/TestFlight rows. No production path writes another lifecycle revision.

`recordMutationVersion` stays intact: successful replace/remove mutations advance it; ordinary inserts, reseats, and ending a game do not. Existing historical sequences, including an old reopen entry, remain valid historical data.

## User experience

- Active local games retain last-hand correction and undo.
- End Game uses terminal wording in English, Traditional Chinese, and Simplified Chinese.
- The ended Dashboard remains a read-only result view with ranking, statistics, settlement, share, and back navigation; it has no reopen action.
- History behaviour is unchanged: ended games lead to the read-only Dashboard and active cards remain non-resumable.

## Verification record

- Automated: full Jest suite, lint, TypeScript, and whitespace checks pass.
- iPhone 17 / iOS 26.5: the current Debug binary was rebuilt, installed, and cold-launched. An existing active QA game displayed the correction entry and correction modal; the End Game dialog displayed the terminal-lock wording; a cold relaunch hydrated history without a crash.
- The existing QA game was deliberately left unchanged, so the destructive confirmation, post-end Dashboard, and post-end History portions of the manual matrix remain covered by automated UI/repository tests and need a separate disposable test game for manual execution.

## Future roadmap

Phase 2A may improve result sharing with shareable result cards, image sharing, and Share Sheet polish. Multiplayer correction, revision browsing, redo, historical editing, and raw backup/export remain future work. Local reopen is not planned.
