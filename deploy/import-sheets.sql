\set ON_ERROR_STOP on
\set VERBOSITY terse
BEGIN;
SELECT pg_advisory_xact_lock(773817);
CREATE TEMP TABLE imported (name text PRIMARY KEY, rows jsonb NOT NULL);
\copy imported FROM '/tmp/madar-sheet-import-20261117.tsv' WITH (FORMAT csv, DELIMITER E'\t')
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM properties WHERE name = 'LOCAL_MADAR_SHEET_IMPORT') THEN
    RAISE EXCEPTION 'This database already has a completed initial Sheets import';
  END IF;
  IF EXISTS (
    SELECT name FROM sheets EXCEPT SELECT name FROM imported
  ) OR EXISTS (
    SELECT name FROM imported EXCEPT SELECT name FROM sheets
  ) THEN
    RAISE EXCEPTION 'Workbook tabs and destination tables differ';
  END IF;
  IF EXISTS (
    SELECT 1 FROM sheets WHERE name NOT IN ('Team', 'AuditLog') AND jsonb_array_length(rows) <> 1
  ) THEN
    RAISE EXCEPTION 'Destination contains business records; initial import would overwrite data';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sheets WHERE name = 'Team' AND jsonb_array_length(rows) = 2
      AND rows->1->>0 = 'm1' AND rows->1->>3 = 'admin' AND rows->1->>12 = 'super'
      AND (rows->0) = (SELECT rows->0 FROM imported WHERE name = 'Team')
  ) THEN
    RAISE EXCEPTION 'Destination admin record or Team columns differ from the initial deployment';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sheets WHERE name = 'AuditLog'
      AND (rows->0) = (SELECT rows->0 FROM imported WHERE name = 'AuditLog')
  ) THEN
    RAISE EXCEPTION 'Destination audit columns differ';
  END IF;
END $$;
UPDATE imported AS target
SET rows = target.rows || jsonb_build_array(jsonb_set(local.rows->1, '{0}', '"local-bootstrap-admin"'))
FROM sheets AS local WHERE target.name = 'Team' AND local.name = target.name;
UPDATE imported AS target SET rows = target.rows || (local.rows - 0)
FROM sheets AS local WHERE target.name = 'AuditLog' AND local.name = target.name;
UPDATE properties SET name = 'PW.local-bootstrap-admin' WHERE name = 'PW.m1';
UPDATE properties SET value = jsonb_set(value::jsonb, '{m}', '"local-bootstrap-admin"')::text
WHERE CASE WHEN name LIKE 'sess.%' THEN value::jsonb->>'m' = 'm1' ELSE false END;
UPDATE sheets AS target SET rows = source.rows
FROM imported AS source WHERE source.name = target.name;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sheets JOIN imported USING (name) WHERE sheets.rows IS DISTINCT FROM imported.rows) THEN
    RAISE EXCEPTION 'Destination differs from the verified import';
  END IF;
END $$;
INSERT INTO properties VALUES ('LOCAL_MADAR_SHEET_IMPORT', '2026-11-17');
SELECT count(*) AS tabs, sum(jsonb_array_length(rows)-1) AS post_import_records FROM imported;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
