-- Promotes the portable latitude/longitude columns to real PostGIS geometry
-- and adds the spatial and lookup indexes. Safe to run repeatedly: it does
-- nothing until the application has created the tables.

DO $$
BEGIN
    IF to_regclass('public.sites') IS NULL THEN
        RAISE NOTICE 'NIRMAN AI tables not created yet; skipping spatial migration.';
        RETURN;
    END IF;

    -- Geometry column for candidate sites (WGS 84).
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites' AND column_name = 'geom'
    ) THEN
        ALTER TABLE sites ADD COLUMN geom geometry(Point, 4326);
    END IF;

    UPDATE sites
       SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
     WHERE geom IS NULL
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL;

    CREATE INDEX IF NOT EXISTS ix_sites_geom ON sites USING GIST (geom);

    -- Geometry for existing facilities and reference layers.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'infrastructure_assets' AND column_name = 'geom'
    ) THEN
        ALTER TABLE infrastructure_assets ADD COLUMN geom geometry(Point, 4326);
    END IF;

    UPDATE infrastructure_assets
       SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
     WHERE geom IS NULL
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL;

    CREATE INDEX IF NOT EXISTS ix_assets_geom ON infrastructure_assets USING GIST (geom);

    -- Lookup indexes used by the engines.
    CREATE INDEX IF NOT EXISTS ix_risk_location ON risk_assessments (location);
    CREATE INDEX IF NOT EXISTS ix_population_location ON population_data (location);
    CREATE INDEX IF NOT EXISTS ix_projects_sector ON projects (sector);
    CREATE INDEX IF NOT EXISTS ix_readings_device_time
        ON sensor_readings (device_id, timestamp DESC);
END
$$;
