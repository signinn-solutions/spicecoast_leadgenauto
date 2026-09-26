# Deployment and data migration

The Docker image contains application code and built frontend assets only. The
six legacy JSON datasets, `.env` files, and SQLite files are excluded from the
build context. Keep secrets in runtime environment variables. The configured
SQLite path is `/var/data/spicecoast.sqlite`, on the persistent disk declared
in `render.yaml`. Use one application instance against that disk.

Writes to each named dataset are atomic SQLite updates, but a workflow that
updates several datasets (for example usage, seen places, leads, and outreach)
is not one transaction. A crash after incrementing usage but before saving a
lead can consume a quota slot without a corresponding history entry; reconcile
from the database backup and application history before changing the counter. The
in-process operation locks also require a single application process.

## New deployment

1. Provision the persistent disk mounted at `/var/data` and set the runtime
   secrets, including `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` for dashboard
   access. Leave `AUTO_SEND=false` until outbound delivery has been tested
   with an approved destination.
2. Deploy the image. The app creates an empty SQLite database on first access
   if none exists. Restarting or replacing the container must keep the same
   disk; an ephemeral filesystem loses the database.
3. Keep a backup of the database and its write-ahead log before changing the
   deployment or disk. A SQLite online backup is preferable while the service
   is running; otherwise stop the service before copying its database files.

## Import existing JSON history

Do the import **offline**, using a trusted local checkout that has the original
six JSON files in its project root. This process does not modify those files.
Do not add them to an image or commit a newly generated database.

1. Back up all six JSON files and the current deployed SQLite database, if one
   exists. For an existing deployed database, preserve it and inspect its
   contents first: the import only fills missing dataset rows and never
   overwrites existing rows.
2. In the trusted checkout, point `SPICECOAST_DB_PATH` to a new, empty local
   path outside the repository and trigger initialization:

   ```sh
   SPICECOAST_DB_PATH=/tmp/spicecoast-import.sqlite node --input-type=module -e "import { loadLeadsHistory, closeStorage } from './server/services/storageService.js'; console.log('Imported leads:', loadLeadsHistory().leads.length); closeStorage()"
   ```

   On PowerShell, set `$env:SPICECOAST_DB_PATH` to the chosen local path before
   the `node` command. Check the imported lead count and other history counts
   against the JSON backups. A malformed JSON file stops initialization rather
   than silently replacing its contents.
3. With the deployed service stopped, place the verified database file at
   `/var/data/spicecoast.sqlite` on its persistent disk. Do this before the
   first start that should use imported data. Ensure the runtime `node` user
   can read and write the file and `/var/data`. Do not overwrite an existing
   production database without a separate, reviewed merge plan.
4. Start one instance, verify history and settings through the app, then keep
   the JSON backup until the database backup and restore procedure is proven.

## Rollback

Stop the service and restore the pre-deployment SQLite backup to the persistent
disk. If the deployment started from JSON only, restore the JSON backups to a
trusted local checkout and run the prior version there. The import leaves JSON
untouched, so this rollback does not depend on exporting SQLite back to JSON.
