# Refresh API (`src/pages/api/refresh.ts`)

This route is the only thing that talks to Google Sheets. It's triggered by
the Apps Script menu button, never by a page visitor.

## Algorithm

1. **Authenticate the request.** Read `Authorization: Bearer <token>` from
   the request header and compare against the `REFRESH_TOKEN` secret. Reject
   with 401 if missing or mismatched. Never accept the token as a query
   parameter — it would end up in browser history, server logs, and Referer
   headers.

2. **Get an access token for the service account.** Build a JWT from the
   `GOOGLE_SERVICE_ACCOUNT_KEY` secret (JSON) and exchange it for an OAuth
   access token scoped to `https://www.googleapis.com/auth/spreadsheets.readonly`.

3. **Discover tabs.** Call `spreadsheets.get` (metadata only, cheap) against
   `SPREADSHEET_ID` to get the full sheet/tab list. Filter for tab names
   starting with `個別QA_`.

4. **Fetch everything in one call.** Call `spreadsheets.values.batchGet`
   with ranges for `設定`, `共通QA`, and every `個別QA_<識別子>` tab found in
   step 3. This must be a single API call regardless of how many
   organizations exist — don't loop per-tab.

5. **Validate before writing anything.** For every `個別QA_<識別子>` tab,
   confirm `<識別子>` matches a 識別子 value present in 設定. If any tab
   fails this check, abort the whole refresh and return an error describing
   which tab is orphaned — do not partially write D1. A half-updated site is
   worse than a stale one.

6. **Write to D1.** Recommended pattern per refresh:
   - `INSERT OR REPLACE` into `companies` for each 設定 row
   - `DELETE FROM common_qa` then re-insert all 共通QA rows **in the exact
     order they were read from the sheet** — there's no display_order
     column, so insertion order is the only thing that determines render
     order (`id` auto-increments in insertion order, and rendering does
     `ORDER BY id`)
   - `DELETE FROM company_qa` then re-insert all rows from every `個別QA_*`
     tab in sheet row order (set `company_slug` from the tab name suffix)

   Wrap steps in a D1 batch/transaction so a mid-write failure doesn't leave
   half the tables updated.

7. **Respond with a human-readable summary**, e.g. `{"message": "3社・42件のQAを反映しました"}`.
   This message is what Apps Script shows the non-engineer in an alert box —
   make it something a non-engineer can read as confirmation, not a stack trace.

## Common pitfalls

- Don't call the Sheets API once per organization — always batch.
- Don't skip step 5's validation — a typo'd tab name should produce a clear
  error, not silently orphaned or silently dropped data.
- Don't let a Sheets API failure (rate limit, transient network error) wipe
  existing D1 data — only write once you have a complete, validated response.
