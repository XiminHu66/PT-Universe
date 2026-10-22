# Game Systems Studio — PoC v0.1

Independent PT Universe application: `apps/game-systems-studio/`.

**Design → Simulate → Compare → Inspect → Export.** The example is a fictional bleed ranger against a sentinel or two raiders, not a measured model of the user's Godot game. The currently connected repositories did not expose `toydg`; no gameplay code or private design data has been imported.

## Try the closed loop

1. Run the default 1,000 fights with seed 42. Pin the completed experiment as baseline.
2. Click 割裂 in the deck. Change its status stacks from 3 to 4; click 保存并模拟.
3. Inspect the win-rate difference, confidence interval and exact configuration diff. Read card direct/DOT damage, block granted and actual healing; open a replay and inspect the damage calculation and RNG.
4. Export the design JSON, or export the full experiment report containing its exact configuration and aggregate results. Importing the design reconstructs the same rules, deck, AI, encounter and seed.

For the shipped demo at seeds 42–1041 the baseline has 643 wins / 1,000; changing only bleed stacks to 4 has 789 wins / 1,000. This is a reproducibility fixture for this ruleset, not evidence about the real game or an optimal build. A seed is expanded into independent match seeds `(seed + i) mod 2^32`.

## Available now

- Structured character, enemy, card, equipment and encounter editors. Stable IDs, range/reference validation, creation, duplicate, guarded deletion and design notes.
- One editable Build: character, one item per weapon/armor/accessory slot, card copy counts, AI policy and targeting. Multiple saved Builds and optimizers are deferred; immutable experiment baselines allow version comparison today.
- Turn combat against up to three enemies; speed order, per-round energy, draw/discard/exhaust, attacks, block, heal, crit, dodge, penetration and six statuses. Identical validated configuration, rules version and seed reproduce the same fight.
- 1 / 100 / 1,000 / 10,000 / 100,000 matches in an isolated browser Worker. Progress and terminate-to-cancel; incomplete aggregates never replace the previous completed experiment. No simulation on page load or refresh. Single-match runs open their trace automatically.
- Wins, losses and unresolved fights; Wilson 95% interval; mean rounds, effective HP damage, energy utilization, dead-hand rate, round distribution, death/unresolved reasons and enemy-turn status coverage.
- Trace with HP/block/status snapshots, card piles, energy, step/seek/playback speed, initial/first-winning/first-losing seeds, optional RNG events and inspectable arithmetic.
- Full immutable baseline, configuration diff and win-rate percentage-point delta. Settings can change during simulation; results retain the launch snapshot and show stale state when needed. Unsaved editor input survives a background result arriving.
- Recent 20 pre-change design snapshots, explicit restore, atomic validated design import, JSON export and experiment report export. Existing Card Lab JSON can be converted; conversion changes combat semantics and is labeled accordingly.
- Godot 4 data loading helper `godot_importer.gd`, formal `schema.json` and `example.json`.

## Rules contract: `gss-combat/1`

Supported stats: HP, attack, defense, speed, accuracy, dodge, crit probability, crit multiplier, armor penetration and status resistance. Item modifiers add directly; final stats must remain in their allowed ranges. Movement, Will and Perception are deliberately not exposed as modeled attributes.

- Each round orders living actors by effective speed (slow = 50%), then stable instance ID. At their own action start, actors clear old block and tick DOT. Stun consumes an action. Hero draws up to the configured hand size, gains energy, plays affordable useful cards and discards the remaining hand. Empty draw piles shuffle the discard pile. Hand cap 20; action cap 60 card plays. The latter terminates a loop explicitly as unresolved.
- RNG: Mulberry32 with an unsigned 32-bit seed, Fisher–Yates shuffle. All draws needed for shuffling, targeting, hit, crit and resistance appear in traced runs. Tracing never consumes extra random values.
- Hit chance = clamp(accuracy − dodge, .05, 1). A hit then rolls crit independently. `max(0, floor((base + attack * scale) * critMultiplier * vulnerableMultiplier − max(defense − armorPen, 0)))`. Crit multiplier is 1 on non-crits; vulnerable multiplier is 1.5 when active. Block absorbs first; damage stats exclude overkill.
- Bleed / poison / burn currently share mechanics: tick for all stacks at target action start, ignore block/armor, then remove one stack (most recently applied source first). Each application retains its source card for actual DOT damage attribution. These are three separately tracked statuses, not three fully differentiated game systems.
- Stun counts skipped actions; vulnerable counts target actions and decrements at their end, including skipped actions. Slow counts round-order evaluations: a newly applied slow begins affecting the next round, then consumes one duration at that round end. State application rolls once against target resistance. A card's status needs a hit when the card also has an attack; status-only cards use resistance alone.
- Enemy `attack` always attacks. `cycle` uses attack → block 8 → heavy attack, repeating by round number. `guard` always blocks and is useful as a stalemate test. No general behavior tree, movement or boss phases.
- Hero AI: deterministic heuristic utility per energy, combining estimated damage/status benefit, useful block, missing-HP healing and draw. Defensive discounts offense and favors block; aggressive discounts block. This is a policy comparison, not an optimizer or prediction of a human player. AI does not inspect future draw order.

Win-rate denominator includes unresolved fights. Mean rounds includes all outcomes. Energy utilization counts energy available on actual non-stunned hero actions; dead-hand rate counts those actions with no affordable card the policy considers useful. Status coverage uses enemy action starts as denominator; statuses overlap. Damage/block/healing contribution is **observational**, not causal uplift, ablation or synergy. There is no automated OP/broken-combo claim. Baseline and current experiments can differ in many settings; the diff exposes these and differing seed/sample sizes are labeled.

## Data and privacy

The only application storage is `localStorage['pt.game-systems-studio.v1']` on this origin. No requests upload designs or reports. No provider key, cloud account, Python server, VPS deployment, analytics, Worker API, scheduler or existing-app storage write is introduced. Static UI modules and the optional Godot helper load from the same deployment.

State is an independent versioned document containing current design, at most 20 design snapshots, one baseline and the latest completed result/config snapshot. Original design data is backed up before an import/restore. A database revision lease and storage events block stale-tab writes. Storage errors retain the previous saved document; editors keep failed input visible and reports can be downloaded from memory. Malformed existing records block automatic overwrite and can be exported raw. Refresh warns about unsaved editor edits or an in-flight experiment.

Design JSON is portable and schema-validated on import; IDs are global and references must resolve. Imported design metadata is treated as text. Unknown schema/engine versions are refused. A raw workspace export includes history and results; importing it recovers only its current design, as labeled in the UI. It is not whole-workspace synchronization. Browser/device data is not cross-device synced.

## Integration limits and architecture

The PoC is static browser ESM and a pure deterministic simulation module in a Web Worker to fit existing GitHub Pages hosting. React/TypeScript, Python/FastAPI, queues and databases remain architecture options after validating the workflow; no unused infrastructure is installed.

`model.mjs` validates configuration and derives equipment stats; `engine.mjs` is UI-independent and usable under Node; `worker.mjs` runs jobs; `studio.mjs` owns UI/state. No rule implementation is embedded in the editor.

Godot helper reads JSON and checks format/version/basic references. It **does not** reproduce combat, create `.tres`, modify the game project or consume telemetry. The full browser validator remains authoritative for numeric limits. FileAccess exports must include the JSON file in Godot's non-resource export settings. References: [FileAccess](https://docs.godotengine.org/en/4.4/classes/class_fileaccess.html), [JSON](https://docs.godotengine.org/en/stable/classes/class_json.html). The helper has not been run inside a Godot project in this environment.

Deck ablation, interaction/synergy matrix, generated loot/affixes, build optimization, economy, progression, telemetry and AI design remain deferred. Existing Card Lab and other PT application code/storage are untouched; the PT launcher only gains one application entry.

## Verification

`node scripts/game-systems/engine-test.mjs`

Tests exercise fixed-seed traces and trace/no-trace equality, input immutability, known RNG output, arithmetic, effective HP caps, damage attribution, equip modifiers, reference/range/schema checks, Card Lab conversion, speed order, exhaustion, zero-cost draw-loop guard, round limit, unique enemy instances, wrapped seeds, aggregate counts and Wilson intervals.

Browser checks cover simulation, baseline pin, 3→4 stack change and configuration diff, replay/step/RNG, batch progress/cancel/100k completion, card contribution, persistence, import/export and design history restore. Responsive QA uses a narrow iframe in Chromium; real Safari/iOS and native Godot runtime parity are not claimed.
