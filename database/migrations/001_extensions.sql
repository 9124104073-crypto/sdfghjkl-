-- Run once by the PostGIS image on first start of an empty data volume.
-- SQLAlchemy creates the tables; this file adds the PostgreSQL-only
-- capabilities the SQLite development path cannot provide.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
