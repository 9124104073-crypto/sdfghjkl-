# data/

Working area for real-world data on its way into the platform. Nothing here is
loaded automatically and nothing here is committed.

```
data/raw/         files exactly as downloaded from an authoritative source
data/processed/   cleaned extracts, ready to become a seed file
```

## Getting real data into NIRMAN AI

The platform reads from `database/seed/`, never from this folder. The path is:

1. **Download** from an authoritative source into `data/raw/`, keeping the
   original filename and noting where and when it came from.
2. **Process** it into the column shape of the matching file in
   `database/seed/` and write the result to `data/processed/`.
3. **Replace** the seed file, and update its entry in
   `database/seed/data_sources.json` — `source_name`, `source_url`,
   `date_collected`, `license`, `verification_status` and `is_demo_data`.
4. **Re-seed**:

   ```bash
   cd backend
   python -c "from app.core.database import SessionLocal; from app.seed import loader; \
              db = SessionLocal(); print(loader.seed_all(db, force=True))"
   ```

No application or frontend code changes are required. The data-status badges,
the lineage page and the Demo/Verified toggle all pick up the new provenance
automatically.

## Sources worth using

`GET /api/v1/data-sources/providers` lists these with their connection status:

| Provider | Organisation | Use for |
| --- | --- | --- |
| GCC | Greater Chennai Corporation | ward boundaries, civic assets |
| CMDA | Chennai Metropolitan Development Authority | master plan land use, zoning |
| OSM | OpenStreetMap | road network, points of interest |
| Bhuvan | ISRO | flood vulnerability, terrain |
| IMD | India Meteorological Department | observed rainfall |
| Census | Census of India / WorldPop | ward demographics |

Do not use unofficial scraped data where an authoritative source exists, and do
not fabricate a value to fill a gap — an unconnected provider returns nothing
by design.
