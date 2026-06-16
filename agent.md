# Agent Guide

This guide is for coding agents working in the CareAccess India workspace.

## Default Routing

- Use `careindia-access-v2/` for UI work. It is the canonical Databricks AppKit app.
- Treat `careindia-access-v1/` as an older reference implementation unless the user explicitly asks for v1.
- Treat `Hackathon-ETL/` and `Hackathon-Views/` as Databricks data pipeline assets. They are not UI directories.

## Architecture

- The UI is a Node.js Databricks AppKit app with an Express server and React/Vite client.
- The server uses the AppKit `lakebase()` plugin and reads Lakebase synced tables.
- The ETL uses Lakeflow Spark Declarative Pipelines with `from pyspark import pipelines as dp` in Python files.
- The SQL gold-layer facility capability step uses Databricks SQL `ai_query()` with a strict JSON schema.
- Lakebase is a serving layer for the UI. Do not move ETL logic into app startup or request handlers.

## Important Files

- `careindia-access-v2/server/server.ts` registers AppKit plugins and starts the app server.
- `careindia-access-v2/server/routes/lakebase/care-desert-indicator-routes.ts` owns the read-only Lakebase API routes.
- `careindia-access-v2/client/src/pages/lakebase/LakebasePage.tsx` owns the map and planning-priority UI.
- `careindia-access-v2/databricks.yml` declares the Databricks App and Lakebase resource.
- `careindia-access-v2/app.yaml` defines the Databricks App start command and injected environment values.
- `Hackathon-ETL/transformations/` owns bronze, silver, and gold Databricks pipeline transformations.
- `Hackathon-ETL/README_Care_Indicators.md` documents the population-risk calculation logic.

## UI Rules

- Keep Lakebase access read-only in the Node server.
- Prefer adding derived fields in the Databricks ETL or view layer, then syncing them to Lakebase.
- Keep the v2 app name and deployment target aligned with `careindia-access-v2/databricks.yml`.
- Preserve the current AppKit scripts: `sync`, `typegen`, `build`, `typecheck`, `lint`, and smoke tests.
- Use `npm install` in `careindia-access-v2/`; package locks are part of the app source.

## ETL Rules

- For Lakeflow Python pipeline code, use `from pyspark import pipelines as dp` and decorators such as `@dp.materialized_view()`.
- For Lakeflow SQL pipeline code, use `CREATE OR REFRESH MATERIALIZED VIEW` or other Lakeflow-supported `CREATE OR REFRESH` forms.
- Keep `ai_query()` prompts grounded in source columns. Do not invent facility capabilities or clinical outcomes.
- If the `ai_query()` response shape changes, update downstream views, Lakebase syncs, server route expectations, and UI display logic together.

## Local UI Commands

Run from `careindia-access-v2/`:

```zsh
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
npm run test:smoke
```

For local Lakebase credentials, generate a short-lived token and pass it as `PGPASSWORD`:

```zsh
db_token=$(databricks postgres generate-database-credential \
  projects/careindia-access-local/branches/production/endpoints/primary \
  --profile careindia-access -o json | jq -r '.token')

DATABRICKS_CONFIG_PROFILE=careindia-access \
PGUSER=your_databricks_user \
PGPASSWORD="$db_token" \
npm run dev
```

## Validation

- For UI-only edits, run `npm run typecheck` and the narrowest relevant build, lint, or smoke test from `careindia-access-v2/`.
- For Databricks App deployment changes, run `databricks bundle validate --profile careindia-access` from `careindia-access-v2/`.
- For ETL or view changes, validate the SQL/Python in Databricks before assuming the UI is correct.

## Git Hygiene

- Do not commit `.env`, `.databricks/`, build output, test reports, Python caches, Terraform state, or generated endpoint-specific AppKit types.
- Do not remove or rewrite user-created workspace changes unless explicitly asked.
- Keep docs pointed at `careindia-access-v2` so new users do not start in the older v1 app.