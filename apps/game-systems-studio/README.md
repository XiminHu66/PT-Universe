# Game Systems Studio · PoC v0.3

One native workbench for **Cards / Incremental / RPG** on PT Universe.

## UI and workflow

- One shell, one navigation model and one set of editors. No feature iframe, separate card UI, or outbound workbench jump.
- Persistent top actions: Save, Experiment Settings, Run / Cancel. Running validates and saves the draft, then computes from an immutable configuration snapshot.
- Design → Results → Replay → Refine. Contribution rows return directly to the matching card, skill or producer editor.
- One result layout for metrics, fixed baselines, configuration diffs, observation tables and provenance. Array object differences identify stable IDs and changed fields.
- Draft edits survive navigation within the workspace and worker completion. Switching game types offers Continue / Discard / Save; an active run is explicitly cancelled before switching.
- Unified object creation, copying and guarded deletion; templates preview before replacing a design. Previous designs are retained in history.
- Cmd/Ctrl+K searches the current design and actions; Up/Down and Enter choose results. Cmd/Ctrl+S saves; Cmd/Ctrl+Enter saves and runs. Native dialogs trap focus; reduced motion is respected.
- On phones: touch-sized navigation, type/object selectors instead of nested horizontal lists, 16px field inputs, and sticky Save/Run actions. Narrow Chromium layout is tested; real iOS/Safari is not claimed.

## Actual modeled systems

| Type | Design | Simulation / analysis |
| --- | --- | --- |
| Cards | Character, enemy, card, equipment, encounter, Build, deck and rules | 1–100,000 fixed-seed fights; Wilson CI; rounds, effective damage, energy/dead hands, direct/DOT contribution, full calculation/RNG replay |
| Incremental | Click income, generators, cost growth, unlockable upgrades, purchasing and prestige | Continuous event-driven income, wallet, target time, wait periods, marginal payback, economic curves and event history |
| RPG | Level stats/growth, items/slots, skills, mana/regen, cooldowns, encounter group and XP thresholds | 1–100,000 encounters or up to 1,000 expeditions; reach/conditional win curves, entering level, skill contribution, causes and stage replay |

Templates are fictional demonstration rules, not calibrated models of the user's game. No AI, paid API, Python service or server queue is required. Simulation runs only when requested, in browser Workers. Contribution is observational, not a causal power estimate or automatic OP verdict.

## Native Card Lab integration

The old dice sandbox is now rendered by native Studio components. It imports only the pure `../card-lab/engine.mjs`, never the old page or DOM. Manual card play, turn ending, seed reset, saved deck/stat editing and battle logs stay in the same shell as the other tools. It retains `ptu.cardlab.config`.

Sending a dice design into the main card model requires explicit conversion confirmation and saves the previous Studio design in history. Dice and automatic combat have different rules; their win rates cannot be directly compared. The classic deck is not overwritten by conversion.

Shared Assets uses the existing PTContent endpoint / checked-in fallback and **the same** `ptu.cardlab.assets` favorites for every game type. Sources and license notes remain visible. This is a catalog/favorites feature, not an asset license grant or runtime attachment.

Old `cards.html` addresses and `apps/card-lab/` open the unified workbench. Legacy root #lab, #data, #versions and genre /sim, /edit paths map to native views. A short-lived legacy transfer token remains supported. PT Universe and Daily Nexus continue using the existing Studio entry.

## Storage and recovery

- Cards: `pt.game-systems-studio.v1`, unchanged schema and engine. Existing designs, baselines, histories and completed results load in place.
- Incremental: `pt.gss.incremental.v1`; RPG: `pt.gss.rpg.v1`.
- `workspace.mjs` validates records, protects damaged data, enforces type isolation and revision leases, and keeps 20 pre-change design snapshots.
- Invalid drafts never overwrite saved designs. Cross-window updates block stale writes. Save failures are surfaced; data is not silently reset.
- Export draft design JSON, full workspace backup, experiment report or raw original record. Import validates and previews first. Full workspace import restores completed result, baseline and history while preserving the replaced design as a snapshot. Other game types remain unchanged.
- No new cloud upload or sync. Existing engine/model versions and runtime JSON formats are retained.

## Rules contracts

**Cards — `gss-combat/1`:** existing pure engine is unchanged. Mulberry32, match seeds `(seed + i) mod 2^32`, speed order, energy, draw/discard/exhaust, armor/crit/dodge and tracked statuses. Bleed/poison/burn currently share stack-decay DOT mechanics. Action/round limits are unresolved, distinct from defeat. Default seed-42 1,000-fight fixture: bleed 3 has 643 wins; bleed 4 has 789.

**Incremental — `gss-incremental/1`:** costs are base × growth^owned. Global multipliers affect clicking and generators. Initial currency is excluded from produced income and target timing. Threshold prestige grants at least 1 point, otherwise floor(sqrt(runIncome / threshold)); resets wallet/generators/upgrades to starting values, retains lifetime income, and multiplies production by `1 + points × bonus`. Purchases/resets before the horizon are processed; endpoint production is included. ROI is a greedy affordable-action policy, not global optimization. Explicit numeric/event guards reject incomplete runs. No live idle clock/offline earnings.

**RPG — `gss-rpg/1`:** realtime autos, independent skill cooldowns, public decision cooldown and capped mana regen. Timestamp ties: hero skill → autoattack → living enemies. Lowest-HP targeting with heuristic balanced/burst/sustain policies. Damage floors `(flat + attack × multiplier) × critMultiplier − defense`, then shield and remaining-HP caps. Every expedition stage restores HP/mana/cooldowns. Enemy scaling `(1 + growth)^(stage − 1)`; XP/gold scale by stage; XP thresholds grow per level. Gold does not buy gear. Reach uses all expeditions; conditional wins only reached samples; unreached stages are null, never zero. Warrior default 100 expeditions / 12 stages / seed 42 completes 82.

No map/movement engine, procedural loot/shop, optimizer, telemetry ingestion or live Godot connection. Existing `godot_importer.gd` handles the card format only; incremental/RPG require runtime-specific adapters.

## Verification

```sh
node scripts/game-systems/engine-test.mjs
node scripts/game-systems/systems-test.mjs
node scripts/game-systems/workspace-test.mjs
```

Tests cover deterministic engines and math, economic conservation/goals/prestige, RPG cooldown/mana/XP/stage denominators, non-destructive legacy conversion, existing card-record preservation, validation-before-write, type isolation, revision leases, bounded history and damaged-record protection. Browser checks cover editing/run/baseline/diff, direct result-to-editor links, native manual play/conversion, replay, type-switch draft protection, version restoration, templates, keyboard search, export/import, responsive selectors and legacy routes.
