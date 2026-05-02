-- migration_001_remove_legacy_reg_format.sql
-- Removes any voter records whose registration_number uses the old 5-part
-- all-slash format (EDS/B/01/04349/2021) instead of the standard 4-part
-- hyphen format (SIT/B/01-00001/2023).
--
-- The regex matches:  3-letters / 1-letter / 2-digits / 5-digits / 4-digits
-- i.e. five slash-separated segments — the legacy format.
--
-- Run ONCE against your database before going to production.

BEGIN;

-- Preview what will be deleted (safe, no changes):
-- SELECT registration_number, email_address FROM Voters
-- WHERE registration_number ~ '^[A-Z]{3}/[BDCMP]/[0-9]{2}/[0-9]{5}/[0-9]{4}$';

-- Delete legacy-format voters (no candidates or votes should reference them yet)
DELETE FROM Voters
WHERE registration_number ~ '^[A-Z]{3}/[BDCMP]/[0-9]{2}/[0-9]{5}/[0-9]{4}$';

-- Log how many were removed
DO $$
BEGIN
  RAISE NOTICE 'Legacy-format voter records deleted.';
END $$;

COMMIT;
