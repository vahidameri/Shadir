# Madar Google Sheets import

On 2026-11-17, imported 14,164 records across 31 workbook tabs into the private Madar PostgreSQL service on ASUS.

- Created and checked a private pre-import custom-format PostgreSQL dump, including table data for the application properties and sheets.
- Validated unique source record IDs, headers and source table coverage. No source formula cells or spreadsheet errors were present. Used cell values, normalized typed dates for the application, and retained timestamps in the audit tab.
- Ran a PostgreSQL dry run through rollback before committing. The committed transaction verified all stored JSONB rows, preserved the three existing audit records and retained the local admin using a separate record ID. Existing local authentication settings stayed in PostgreSQL. The resulting total was 14,168 records across 31 tabs including preserved rows.
- Restarted the Madar web container to clear its dataset cache. Health, local admin login and application API counts passed for Projects, Tasks, Team, Files, Contacts, Mizito, MizitoComments and MizitoMentions.
- Drive attachment entries and the URLs stored in the sheet were imported. Drive file bytes and Drive sharing permissions were outside this import. The browser UI was outside the verification scope.

Import scripts are in `deploy/stage-sheets-import.py` and `deploy/import-sheets.sql`. The scripts target an initial import, check the environment, and refuse to overwrite a populated deployment. The source export and credentials are excluded from Git.

Offline Graphify indexed and queried the Python importer (49 nodes and 55 edges in the deploy graph). The SQL parser was unavailable in Graphify. PostgreSQL executed the SQL successfully in both dry-run and commit modes.
