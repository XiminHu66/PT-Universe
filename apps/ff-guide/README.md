# FF Guide · 最终幻想 共鸣

Buildless, static guide and factual game-record archive at `apps/ff-guide/`.
The project is registered in the PT Universe home and Daily Nexus toolbox and is
published by the existing `pages.yml`. It needs no new service, API key or public port.

The interface provides global bilingual search, source/type/chapter filters, cards
and tables, linked detail pages, 8 chapter walkthroughs, 99 individual tablet-shard
locations, and collection/favorite/note records. Records use the existing
`ptu.ffguide.*` encrypted PT Universe sync scope when the browser is paired.
Local progress can also be exported/imported. Imports merge known entry IDs.

`data.json` is a versioned snapshot. Every record has a source reference and exact
source page where available. Factual records are separated from original Chinese
guide summaries. English names and original descriptions are retained where a
verified Chinese game string is unavailable. The site does not claim in-game
testing of every record, or that internal records are obtainable in every save.

Important scope details:

- 596 enemy records include variants, not 596 unique monster species. The enemy
  category also contains 15 separately identified cave-master guide entries.
- 798 player-related skill/passive records exclude unrelated internal abilities.
- Equipment counts refer to records in the imported catalog, not screenshot totals.
- Esper base-growth evidence retains its demo-build provenance. Formal-release
  import does not independently revalidate combat formulas.
- Acquisition routes and translations cite their respective guide authors; the
  original linked image/video guides remain on their source sites.

Refresh and validation:

```sh
python scripts/ff-guide/import_database.py --cache-dir /tmp/ff-guide-cache --output /tmp/ff-guide-database.json
python scripts/ff-guide/assemble.py --database /tmp/ff-guide-database.json --curated scripts/ff-guide/curated.json --output apps/ff-guide/data.json
python scripts/ff-guide/validate.py
node --check apps/ff-guide/app.js
```

See `scripts/ff-guide/README.md` for extraction scope. New game updates require
review of the source versions and changes; there is no unattended scraper.
Original character art and game content belong to SQUARE ENIX and their respective
owners. The local banner is credited to the linked Vorxu game hub; other game
sprites retain exact ATMA asset URLs. No external editorial article was copied.
