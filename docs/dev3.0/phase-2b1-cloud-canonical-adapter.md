# Phase 2B-1 — Pure Cloud Canonical Adapter and Result Characterization

Date: 2026-08-10

Baseline: `5cd69c0 docs(dev3): audit cloud ended result parity`

## Executive verdict

The current locally persisted Cloud archive can now be interpreted by a strict, pure domain path:

```text
unknown frozen archive
  -> strict legacy source parser
  -> Cloud canonical adapter
  -> replayGameRecord()
  -> characterized Cloud result projection
```

The result is canonically valid only relative to the frozen source that was supplied. The legacy source remains unverified: it has no schema marker, digest, server-atomic snapshot guarantee, or anti-tamper proof. The new path is intentionally not connected to the Cloud archive screen or live multiplayer table in this phase.

## Source-format compatibility contract

The existing payload remains unmodified and unversioned in SQLite. Domain interpretation identifies its current shape as:

```text
legacy_unversioned_cloud_archive_v0
```

This is adapter metadata, not a new persisted field. The parser accepts the existing archive-flow lifecycle snapshots (`ended` or `archived`) and reads only data required for canonical interpretation. Timestamps are not correctness dependencies.

Source trust is explicitly:

```text
legacy_unverified
```

`canonicalValid: true` means the frozen object is internally complete enough for strict adaptation and canonical replay. It does not claim the Firestore history or local archive is immutable or tamper-proof.

## Strict parser contract

`parseCloudArchiveSource(unknown)` performs runtime validation and returns typed success/failure diagnostics without throwing for malformed archive data. It validates:

- stable room identity, terminal archive lifecycle, positive command version, non-negative hand count, and active lineup version;
- a complete serialized HK RulesV1 snapshot;
- member UID and temporary-player ID as distinct stable identity namespaces;
- non-empty display-name metadata without using names as identity;
- lineup version, effective index, four complete seats, four unique identities, and known identity references;
- one-based, unique, contiguous hand indexes and stable source hand IDs;
- outcome-specific winner, discarder, dealer action, and fan structure;
- room hand count against the complete valid source hand list.

Malformed source returns stable source diagnostics and no parsed source. It never falls back to default rules, another lineup, a display name, current seats, or a guessed hand.

## Strict HK rules

The parser requires version 1, `variant = mode = HK`, fan scoring, a supported traditional/custom preset, a supported gun/stake mode, valid minimum fan, valid unit/cap values, immediate settlement, currency symbol metadata, and the currently supported dealer-multiplier behavior. Unsupported variants produce `UNSUPPORTED_RULE_VARIANT`; missing, malformed, incomplete, or unsupported HK snapshots produce `CORRUPTED_RULES_SNAPSHOT`.

The adapter does not calculate HK settlement. It maps the validated rule values to `CanonicalHkRules`; `replayGameRecord()` remains the only payout authority.

## Hand index and traceability

Cloud source indexes are validated before normalization:

```text
Cloud 1, 2, 3 -> canonical 0, 1, 2
```

Zero, negative, fractional, duplicate, or non-contiguous source indexes reject. `room.currentVersion` remains command/version metadata and is never treated as a hand index or hand count.

Storage traceability remains outside the canonical hand type:

```text
sourceHandId
sourceHandIndex
canonicalHandIndex
canonicalHandId
```

The canonical ID is a deterministic namespace of the source ID. No random ID or clock is used.

## Identity and historical participants

Member UID and `tempPlayerId` remain separate canonical identities even when display names match. Identity is never inferred from name, seat, array order, or current lineup.

A legitimate game may contain more than four historical identities. The smallest storage-independent canonical extension was made:

- canonical replay accepts at least four known historical identities;
- initial seats and every effective boundary still require exactly four seats and four unique known identities;
- the Local adapter continues to require exactly four permanent local player rows;
- concrete Local dealer snapshots continue to receive mismatch validation.

Canonical players include identities needed by any initial, historical, or pending lineup. Result participants are narrower:

- with completed hands, an identity participates only if it appears in the exact effective lineup of at least one completed hand;
- a pending lineup after the last completed hand may change final current seats but does not add its never-played identity to ranking or statistics;
- with zero completed hands, participants come from the lineup effective for Cloud Hand 1, including a valid pre-first-hand replacement.

## Lineup mapping

Exactly one source lineup must have `effectiveFromHandIndex = 0`; it becomes canonical initial seats and is not duplicated as a boundary.

Later source boundaries normalize as:

```text
Cloud effective hand k -> canonical effectiveFromHandIndex k - 1
```

The adapter interleaves each boundary before the matching canonical hand. A source boundary effective at `currentHandIndex + 1` becomes a valid canonical boundary at `handCount`, updating final/current seats without changing earlier hands.

Every hand must reference an existing exact `lineupVersion`, and that version must be the lineup effective at that source hand index. Winner and discarder must belong to those exact four seats. There is no current-lineup or nearest-boundary fallback.

The production host may submit multiple lineup changes before the next hand. Those versions share an effective source index; the highest/latest version is the effective mapping, while superseded versions form an empty interval. A completed hand must reference that final effective version.

Lineup versions from 1 through `activeLineupVersion` must be present, version-effective indexes must not move backwards, and the active version must be the final known version. Version metadata is consistency evidence only; no correction or mutation semantics are inferred from it.

## Starting dealer and hand mapping

The legacy source does not store a starting dealer or per-hand dealer snapshot. The compatibility adapter explicitly sets:

```text
startingDealerSeatIndex = 0
```

and emits informational diagnostic `IMPLICIT_STARTING_DEALER_SEAT_ZERO`. Cloud canonical hands set the optional source dealer evidence to `null`; replay derives every hand's dealer and round from the starting state and preceding canonical timeline.

Outcome mapping is strict:

- zimo requires a known winner in the exact lineup, integer fan, no discarder, and no draw action;
- discard requires distinct known winner/discarder identities in the exact lineup, integer fan, and no draw action;
- draw requires explicit `stick` or `pass` and no winner/discarder. The current writer's irrelevant default draw fan may be present in source, but canonical draw fan is always `null`.

Current Cloud hands contain no stored settlement deltas. Canonical hands therefore set `persistedDeltasQ = null`; no evidence is fabricated.

## Replay and result projection

The adapter performs representation mapping only. `replayGameRecord()` exclusively derives settlement, dealer progression, round progression, player totals, wins, zimo/discard counts, final seats, and final next-hand state.

The pure characterization projection then:

- filters replay players to completed-game result participants;
- applies the existing competition-rank helper (`1,1,3,4`; all-zero `1,1,1,1`);
- applies the existing all-ties stats-leader helper and returns no leader for an all-zero category;
- exposes current-hand round state separately from replay's after-hand/next-hand state;
- carries hand source traceability, effective seats, replay deltas, validated rules, final seats, and final round;
- emits no localized UI copy and no Share payload.

## Diagnostic and stage model

The top-level pure pipeline reports separate stages:

```text
sourceStatus
adapterStatus
replayStatus
projectionStatus
canonicalValid
sourceTrust
```

Source diagnostics cover malformed room/player/rules/lineup/hand structure, duplicate identities/versions/indexes, unknown identities, gaps, invalid boundaries, and count mismatch. Adapter diagnostics cover missing initial/active/intermediate lineup versions, exact-version boundary mismatch, hand identities outside exact seats, and the informational implicit-dealer rule. Replay diagnostics remain the existing `ReplayValidationCode` contract; for example, a structurally valid fan below the configured minimum fails at replay and no projection is returned.

No stage returns a plausible partial result after an error.

## Characterization outcome

Deterministic pure fixtures cover:

- zero hand, zimo, discard, draw stay/pass, multi-hand and zero-sum results;
- dealer stay/advance, East-North to South-East, current-hand labels, final next-hand state, and a 128-hand timeline;
- one-based normalization, source IDs, gaps, duplicates, zero index, and room-count mismatch;
- stable seats, swaps, member/temp replacement, more than four historical identities, same names with distinct IDs, pending final boundaries, and zero-hand effective starting seats;
- missing exact lineup, boundary mismatch, duplicate/gapped versions, missing active/initial mappings, unknown/duplicate/incomplete lineup players, and same-index supersession;
- strict traditional/custom rules and no-fallback rejection;
- competition ties, all-zero ties, all tied zimo/discard leaders, and zero-leader behavior;
- invalid winner/discarder identities, winner-equals-discarder, invalid draw action/fan, malformed structure, deterministic output, input immutability, and no clock use;
- Local exact-four adapter behavior, concrete dealer mismatch behavior, and canonical replay with additional historical identities or absent source dealer evidence.

Happy-path traditional/custom settlements, player totals, zero-sum behavior, dealer progression, round progression, draws, and identity-based statistics match the existing intended HK semantics through canonical replay. Known Cloud screen presentation defects are not used as expected truth.

## Temp-player Merge limitation

Missing referenced member/temp identity is detectable and rejects. A fully destructive Merge may already have rewritten every historical lineup and winner/discarder reference to a member UID and removed the old temp identity. The frozen post-merge source then contains no proof of the erased identity, so Phase 2B-1 does not invent or reconstruct it.

Current source cannot prove pre-merge identity history after a fully destructive Merge.

## Deliberately unchanged surfaces

Phase 2B-1 changes no Cloud screen, live multiplayer table, Firebase read/write path, Firestore rule, archive writer, SQLite schema/repository, TTL/cleanup flow, share formatter, navigation, local Dashboard, correction flow, or lifecycle behavior. The new path is domain-only and currently exercised by tests.

## Deferred issues and Phase 2B-2 prerequisites

Multiplayer correction remains **NOT READY**. Before correction or canonical UI authority is enabled, Phase 2B-2 should define and enforce:

1. a versioned Cloud/archive source contract with explicit starting dealer and canonical/replay version metadata;
2. server-atomic or otherwise completeness-guaranteed end/archive capture;
3. digest/integrity evidence and immutable ended/archive history;
4. Firestore lifecycle and permission hardening so ended/archived rooms cannot be reactivated or mutated;
5. non-destructive, versioned temporary-player merge/revision semantics;
6. correction actor authority, stale guards, mutation ordering, immutable revisions, and replay-after-write validation;
7. migration/compatibility policy for legacy `legacy_unverified` archives;
8. only after those foundations, Cloud result-screen wiring and parity polish as a separate UI checkpoint.
