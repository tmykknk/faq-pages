# Cloudflare Pages + D1 setup

All commands use pnpm's `wrangler` — do not substitute npm/npx or Bun here;
this project standardizes on pnpm.

## 1. Create the D1 database

```bash
pnpm wrangler d1 create <db-name>
```

Copy the returned `database_id` into `wrangler.jsonc` (Cloudflare's current
default config format — `wrangler.toml` still works, but new scaffolding
tools generate `.jsonc`, so this skill assumes `.jsonc`):

```jsonc
{
  "name": "faq-pages",
  "compatibility_date": "<today's date>",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "<db-name>",
      "database_id": "<paste-id-here>"
    }
  ]
}
```

## 2. Apply the schema

```bash
pnpm wrangler d1 execute <db-name> --local --file=references/d1-schema.sql   # local dev
pnpm wrangler d1 migrations apply <db-name> --remote                         # production
```

## 3. Create the Pages project

- Cloudflare dashboard > Workers & Pages > Create > Pages
- Connect the GitHub repo (auto-deploy on push)
- Build command: `pnpm run build`
- Build output directory: `dist`

## 4. Bind D1 in the dashboard

Pages project > Settings > Functions > D1 database bindings. Binding name
must match `wrangler.jsonc` exactly (`DB`). This has to be set in **both**
`wrangler.jsonc` (for local `wrangler dev`) and the dashboard (for the
deployed build) — they don't share configuration automatically.

## 5. Environment variables / secrets

Settings > Environment variables, set for both Production and Preview:

| Name | Value | Type |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | service account JSON key | Secret |
| `SPREADSHEET_ID` | target spreadsheet's ID | Plain |
| `REFRESH_TOKEN` | shared secret, same value pasted into Apps Script Script Properties | Secret |

## 6. Google Cloud prerequisites (if not already done)

- Enable the Google Sheets API on the project
- Create the service account and download its JSON key
- Add the service account's email as a viewer on the shared drive that
  contains the spreadsheet
