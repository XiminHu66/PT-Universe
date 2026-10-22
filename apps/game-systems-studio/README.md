# Game Systems Studio · PoC v0.2

PT Universe's integrated workbench: Design → Simulate → Compare → Inspect → Export.

## Working systems

| Workspace | Design and simulation | Analysis |
| --- | --- | --- |
| Cards / Deckbuilder | Characters, items, deck, statuses, AI, encounters; 1–100,000 seeded fights | Win rate / Wilson CI, rounds, direct and DOT contribution, resources, replay / RNG |
| Incremental / Idle | Click income, generators, escalating costs, global upgrades, unlock requirements, buying policy, threshold prestige; up to 7 simulated days | Production, wallet, target time, purchase waits, marginal payback, event history |
| RPG / Progression | Level stats/growth, equipment slots, mana/regen, skill cooldowns, enemy groups, XP/gold expeditions | Victory / completion, reached and conditional stage wins, entering levels, skill contribution, death cause, exact replay |

Real browser Worker calculations, with cancellation. No AI, server simulation, Python service or paid API required. Templates are fictional examples, not a calibrated model of the user's game. No automatic run on load.

## Integrated Card Lab

The previous `apps/card-lab/` remains operational with original dice rules, manual play and editor. Studio embeds this implementation as Classic Play. An exact-child-window, same-origin message transfers the validated draft through a short-lived token. Explicit import preserves the previous Studio design in history and never changes the classic deck. The rules differ: win rates across these engines are not directly comparable.

Shared Assets uses the existing PTContent endpoint and checked-in fallback, with the same `ptu.cardlab.assets` favorites. Cross-tab events keep both views current. Sources and license notes stay attached; no new license grant or runtime asset attachment is implied.

PT Universe has one Studio launcher entry; old Card Lab launcher IDs alias into classic play, including favorites/recents migration. Daily Nexus's toolbox opens Studio. Direct Card Lab URLs still work and offer a Studio link and conversion action.

## Try the loops

1. Cards: run the original example with 1,000 fights, seed 42; pin, change bleed stacks 3→4, save/rerun. The unchanged card fixture has 643→789 wins.
2. Incremental: run the mine, pin, edit a producer cost-growth multiplier, save/rerun. Inspect target time, production and the full configuration diff.
3. RPG: run the warrior through 12 stages, 100 expeditions, seed 42. The fixture completes 82/100. Pin, change a skill or enemy growth, rerun with the same seeds. Replay any reached stage and inspect mana, crit RNG and actual damage.
4. Classic Play: play manually, edit the saved deck, send to Cards and review the conversion warning. Shared Assets continues the existing favorites.

## Rules and boundaries

**Incremental — gss-incremental/1.** Continuous event-driven production; generator cost = base × growth^owned. Global multipliers affect clicks and generators. Starting currency is excluded from produced income and goal time. Threshold prestige grants max(1, floor(sqrt(runIncome / threshold))) points, resets wallet/generators/upgrades to initial values, retains lifetime produced income, and multiplies production by 1 + points × bonus. Purchases/resets strictly before the horizon are processed; endpoint production is included. ROI buying greedily chooses cost / immediate marginal production among affordable actions; it is not globally optimal. There is no running idle game/offline clock. Numeric/event guard failures never become completed partial results.

**RPG — gss-rpg/1.** Realtime autoattacks, individual skill cooldowns, public decision cooldown and continuously capped mana regeneration. Timestamp ties: hero skill → hero attack → living enemies. Lowest-HP targeting, heuristic balanced/burst/sustain policies. Damage = max(0, floor((flat + attack × multiplier) × critMultiplier − defense)), then shield absorption and HP-capped damage. Trace/no-trace consume identical RNG. One equipped item per slot; HP/attack/defense growth applies before equipment.

Expeditions restore full HP/mana/cooldowns at every stage. Enemy scaling is (1 + growth)^(stage − 1). XP and gold scale by stage; XP thresholds grow by level. Gold does not automatically purchase gear. Stage reach uses all expeditions; conditional wins use reached samples. Unreached stages have null conditional wins, not zero. Limits: 1,000 expeditions / 100,000 single fights; timeout is unresolved. No movement/map, loot generator, shop decisions, optimizer or telemetry ingestion.

**Cards — gss-combat/1.** Existing engine/model remain unchanged: seeded Mulberry32, independent match seeds (seed + i) mod 2^32, speed order, energy, draw/discard/exhaust, armor/crit/dodge and six tracked statuses. Bleed/poison/burn currently share stack-decay DOT mechanics. Inspect full rules in Cards. Guard limits are unresolved. Contribution is observational, not a causal card-power estimate.

## Data, export and compatibility

- Cards: `pt.game-systems-studio.v1`; classic deck: `ptu.cardlab.config`; assets: `ptu.cardlab.assets`.
- Incremental / RPG: independent `pt.gss.incremental.v1` and `pt.gss.rpg.v1`. Each keeps 20 pre-change designs, last completed experiment and immutable baseline. Corrupt workspaces block overwrites and offer raw export. Revision leases protect against stale cross-tab writes.
- `cards.html` preserves the original card interface. Root #lab / #data / #versions redirects preserve old links.
- Cards retain `pt.game-systems-studio`, schemaVersion 1, `schema.json`. New systems use `pt.game-studio.system`, schemaVersion 1, explicit gameType and engineVersion, validated by systems-model.mjs.
- JSON import previews replacement, validates first and saves the previous design. Reports contain immutable launch config, engine version, fingerprint and results. Multiple changed fields do not establish single-parameter causality.
- Local JSON design / raw workspace backup; no new cloud upload or sync.
- Existing `godot_importer.gd` handles the card format only. Incremental/RPG need runtime-specific adapters. No live Godot parity claimed.

## Verification

```sh
node scripts/game-systems/engine-test.mjs
node scripts/game-systems/systems-test.mjs
```

Tests cover original card reproducibility and arithmetic; analytic incremental income, cost sequence, conservation, target timing, prestige; RPG trace parity, damage/mana bounds, cooldowns, unlocks, XP progression, stage denominators; validation and non-destructive Card Lab handoff. Browser QA checks workspaces, visual edits, baseline/diff, simulation/replay, classic play/conversion, shared favorites and narrow-screen layout. Real Safari/iOS and native Godot execution remain unverified.
