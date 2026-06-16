# careindia-access

Minimal Databricks AppKit app for the CareIndia workspace. The app reads from Lakebase and renders planning-priority views for regional healthcare decision-makers, including a Mapbox heatmap.

Lakebase access is read-only. Do not add routes or startup code that mutates data, creates schemas, or writes derived fields back to Lakebase.

## Current Data Source

- Workspace profile: `careindia-access`
- Lakebase project: `projects/careindia-access-local`
- Endpoint: `projects/careindia-access-local/branches/production/endpoints/primary`
- Postgres database: `databricks_postgres`
- Table used by the app: `default.care_desert_indicators_sync`
- Rows discovered: `706`
- District center coordinates: read from `default.facility_district_distances_v_sync`
- Facility distance calculations: computed from `default.facility_district_distances_s_v_sync`
- Population and intervention priority: read from `default.healthcare_master_view_v_sync`

The current live schema includes `maternal_neonatal_access_score`, `maternal_neonatal_skilled_attendance_gap`, and `maternal_neonatal_csection_access_flag`. The older `maternal_neonatal_care_score` column is no longer selected by the app.

## Run Locally

```zsh
cd /Users/zachary.higgins/Projects/hackathon-ui/careindia-access

db_token=$(databricks postgres generate-database-credential \
  projects/careindia-access-local/branches/production/endpoints/primary \
  --profile careindia-access -o json | jq -r '.token')

DATABRICKS_CONFIG_PROFILE=careindia-access \
PGUSER=zachhiggins@gmail.com \
PGPASSWORD="$db_token" \
npm run dev
```

Open `http://localhost:8000`.

The Mapbox token is public and defaults in the frontend. To override it locally, set `VITE_MAPBOX_TOKEN` before running the app.

The map uses estimated population impact for heat intensity and point size, and intervention priority for point color.

## Useful Commands

```zsh
npm run typecheck
npm run build
databricks apps validate --profile careindia-access
```

## Source Map

- `server/server.ts` registers AppKit plugins and app routes.
- `server/routes/lakebase/care-desert-indicator-routes.ts` reads the Lakebase synced table.
- `client/src/App.tsx` renders the app shell.
- `client/src/pages/lakebase/LakebasePage.tsx` renders the table view.
- `databricks.yml` declares the Databricks App and Lakebase resource.
