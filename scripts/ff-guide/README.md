# ff-guide source importer

This importer reads public game-record facts; it does not execute source-site JavaScript, copy full walkthrough prose, or infer unavailable locations or formulas.

## Rebuild a fact snapshot

Requires Python 3, `beautifulsoup4` (4.x), and `curl`.

```bash
python scripts/ff-guide/import_database.py --cache-dir /tmp/ff-guide-cache --output /tmp/ff-guide-database.json
```

Use `--use-cache` to resume previously downloaded pages without fetching them again. At most four source requests run concurrently. A failed request, changed schema, incomplete enemy detail import, unexpectedly reduced count, or duplicate ID stops the importer before replacing the requested output. The prior output is retained. Cached pages are replaced only after a successful HTML response.

Pass the resulting fact snapshot and separately maintained Chinese guide files to `assemble.py`; the importer does not replace the curated guides.

## Provenance and boundaries

- ATMA Databook (`https://atma.gg/final-fantasy-resonance/`) provides player skill cards, role/element classifications, real game images, 596 enemy record variants, and the side-quest index. At the initial snapshot its player table contains 460 active skills, 312 passives, and 26 mastery spirits. These are not the complete set of enemy/internal abilities.
- FF Resonance Codex (`https://ffresonancecodex.com/research`) publishes extracted records marked Steam release build 24250053 in the initial snapshot. The importer reads the page's JSON RSC payload as data. It extracts item/equipment facts, learning levels, awakening and mastery rewards, and map/reward records.
- Codex Esper growth evidence remains explicitly scoped to demo build 24032336. The catalogue's release header does not establish independent re-verification of those growth records. This limitation is displayed on Esper entries.
- Codex awakening ranks 1–4 represent **0–3 stars including the initial state**, verified against ATMA's Cloud page, which displays 0, 1, 2 and 3 filled star icons. They do not mean four paid awakening upgrades.
- Enemy count includes same-name story/Colosseum variants. Each remains identifiable by its stable source record ID. Difficulty-sensitive values are retained separately for Easy, Normal and Expert. A missing affinity is not invented.
- `Sanctity`/`SANC` retains the English field label in parentheses and is distinct from `Spirit`.
- Source-game placeholder descriptions such as `[TEMP]` are labelled as placeholders. They are not expanded into invented effects. A zero shop-table price is not described as an obtainable free item.
- Maps and event/shop grants are recorded sources, not verified NPC quest walkthroughs. A record being present does not establish availability in every save.
- Common Chinese character names are lookup aliases. Original English names and exact entity source links are retained. Images and game materials belong to their respective owners.

Raw downloaded pages stay in the selected scratch cache and are not committed. Only the parsed factual snapshot and importer code should be published.
