---
name: sheets-cms-qa-site
description: Builds and maintains a company/organization QA (FAQ) site that uses a single Google Spreadsheet as a non-engineer-friendly CMS, with Astro (SSR) + Cloudflare Pages + Cloudflare D1 as the runtime and a Google Apps Script one-click refresh button as the update trigger. Use this skill whenever the user wants to build or modify a spreadsheet-driven QA/FAQ page, a "company profile + QA" landing page, or any "Google Sheets as CMS" style site meant for non-engineers to update themselves — even if they don't say Astro, D1, or Cloudflare by name. Also use this skill when asked to add a new company/organization, add or restructure a QA category, change the spreadsheet schema, change the sync/refresh logic, or debug why sheet edits aren't showing up on the site.
---

# Sheets CMS QA Site (Astro + Cloudflare Pages + D1)

## What this system is

A low-maintenance QA/FAQ site for many organizations (companies, stores, branches, etc.), where **non-engineers edit a single Google Spreadsheet** and click one button to publish. There is no rebuild/redeploy step for content updates — only a data refresh.

Read this skill fully before writing code. It encodes decisions that were deliberately made to satisfy three constraints that pull against each other: **zero cost, non-engineer editability, and fast/consistent updates**. Deviating from them (e.g. switching back to KV, splitting the spreadsheet into multiple files, or building a route-per-organization) reintroduces problems that were specifically designed around — see "Why these choices" below before changing them.

## Architecture at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | Astro, SSR mode, on Cloudflare Pages | One deployable unit — no separate Workers service to maintain |
| Data store | Cloudflare D1 (not KV) | D1 reads are consistent immediately after a write; KV can take up to ~60s to propagate globally, which breaks the "click refresh, see it update" expectation |
| Data source | Google Sheets API v4 + service account | Org already manages Google Workspace sharing permissions this way |
| Update trigger | Custom menu button in the spreadsheet (Apps Script) → POST to a refresh API route | Non-engineers should never need to construct or paste a URL |
| Package manager / local dev | **pnpm only** | Standardize on one toolchain; do not introduce Bun or npm instructions |
| Routing | **Single URL, content controlled by a query parameter** (e.g. `/company?id=<identifier>`), not one route per organization | Keeps routing/config trivial as organizations are added — adding an org never touches routing code |

## Why these choices (read before changing them)

- **D1 over KV**: KV's multi-region propagation delay means an admin could click "update" and see stale content depending on which edge node serves them. D1 is backed by a single primary, so a write is visible on the very next read everywhere. Don't reintroduce KV for this system's primary data.
- **One spreadsheet, not one file per organization**: `spreadsheets.values.batchGet` can pull every tab in one request regardless of how many organizations exist. One file per org means N API calls per refresh and N sets of sharing permissions to maintain — both scale badly past a handful of organizations. Keep it to one spreadsheet.
- **Query parameter routing, not per-org static/dynamic routes**: a single `/company` (or similarly named) page reading `?id=` keeps the Astro routing surface fixed no matter how many organizations are added later — no new files, no new deploy needed to onboard an organization.
- **pnpm only**: earlier drafts of this system discussed Bun as an option. That's been settled — use pnpm exclusively so there's one documented toolchain. Cloudflare's execution runtime is always `workerd` (V8 isolates) regardless of package manager — pnpm only affects local dev and the build step, never production behavior.

## Spreadsheet structure (one workbook)

Tab and column names shown to non-engineers must be **Japanese**. The one exception is the "identifier" column, which must be **half-width alphanumeric** — it's used both as the URL query value and as part of tab names, so it can't contain spaces or full-width characters.

```
📄 Spreadsheet
 ├─ Tab: 設定              ← one row per organization
 ├─ Tab: 共通QA             ← QA shown on every organization's page
 ├─ Tab: 個別QA_<identifier> ← one tab per organization, additional QA only
 └─ Tab: _個別QAテンプレ        ← hidden template tab, copy this to onboard a new org
```

**設定** (one row per organization):

| Column | Notes |
|---|---|
| 識別子 | half-width alphanumeric, unique, used as `?id=` value and as the `個別QA_<識別子>` tab suffix |
| 会社名 | |
| 郵便番号 | |
| 住所 | |
| 電話番号 | |
| メールアドレス | |
| 担当者名 | optional |
| 公開 | TRUE / FALSE |

**共通QA** and **個別QA_<識別子>** (same column structure in both):

| Column | Notes |
|---|---|
| カテゴリ | e.g. "料金について". Reuse a category name from 共通QA in an individual tab to append to that category; use a new name to create an org-specific category |
| 質問 | |
| 回答 | |
| 公開 | TRUE / FALSE |

There is no 表示順 column — display order follows row order in the sheet (top to bottom), so reordering is just dragging rows. Preserve that row order end to end: fetch rows in sheet order, insert into D1 preserving that order (e.g. an auto-increment `id` that mirrors insertion order), and `ORDER BY id` when rendering — don't re-sort by any other key.

At render time, an organization's QA is `共通QA` (all orgs) + `個別QA_<their identifier>` (their tab only), grouped by カテゴリ. Within a category, 共通QA rows render first in their sheet order, followed by that organization's 個別QA rows in their sheet order. This is additive only — 個別QA never overrides or removes a 共通QA row. If a user asks for override/exclusion behavior, that's a schema change (e.g. an "override target ID" column) — don't invent it silently, confirm with the user first.

## Build order

1. **D1 schema** — see `references/d1-schema.sql`. Three tables: `companies`, `common_qa`, `company_qa`.
2. **Astro project (pnpm)** — SSR mode with the Cloudflare adapter, D1 binding exposed via `context.locals.runtime.env.DB`.
3. **Refresh API route** (e.g. `src/pages/api/refresh.ts`) — see `references/refresh-api.md` for the exact sync algorithm (batchGet strategy, identifier/tab-name validation, D1 upsert order).
4. **Rendering route** — a single page (e.g. `src/pages/company.astro`, `export const prerender = false`) that reads the identifier from `Astro.url.searchParams`, looks up the organization in D1, and renders its merged QA list. Do not create per-organization files or dynamic `[slug]` routes. Follow `references/frontend-design.md` for the accordion/search/category layout, color tokens, and typography — read it before writing any markup or CSS for this route.
5. **Apps Script menu** in the spreadsheet — see `references/apps-script.md`. Calls the refresh route with a bearer token in the `Authorization` header, never as a URL/query parameter.
6. **Cloudflare Pages configuration** — see `references/cloudflare-setup.md` for D1 binding, environment variables/secrets, and build settings.
7. **README.md** — write a separate `README.md` at the project root documenting local environment setup (Node/pnpm install, `pnpm astro dev`, `wrangler d1` local migration commands, required `.dev.vars`/env vars for local testing). Keep this out of the application code comments — it's the onboarding doc for the next engineer who clones the repo, so it belongs in its own file, not folded into this skill's output or into inline comments.

## Frontend design

Full detail (color tokens, typography, markup structure, accessibility
rules) lives in `references/frontend-design.md` — read it before touching
the rendering route's markup or CSS. The decided direction, in brief:

- QA items are accordions (`+` collapsed / `−` expanded), one section per
  カテゴリ.
- A search box and a category `<select>` sit above the sections; search
  filters client-side by 質問/回答 text, the dropdown is populated from the
  categories actually present for that organization.
- Colors are defined as CSS custom properties in `oklch()`, not hex.
- The palette and type stack are based on Claude's own product interface —
  warm cream surface, warm-gray ink, a single terracotta accent used
  sparingly (never as a large fill), one humanist sans-serif for both
  headings and body. This is a deliberate, already-decided direction — don't
  substitute one of the generic AI-design defaults the `frontend-design`
  skill warns about.

## Validation checklist before considering the build done

- [ ] Adding a new organization requires only: one row in 設定, a copied+renamed `個別QA_<識別子>` tab, and clicking 更新 — no code or deploy changes
- [ ] `spreadsheets.values.batchGet` (or equivalent) fetches 設定, 共通QA, and all `個別QA_*` tabs in a single API call
- [ ] Refresh route rejects a request where a `個別QA_<識別子>` tab's suffix doesn't match any 識別子 in 設定, without writing partial/corrupt data to D1
- [ ] `?id=` for a non-existent or 非公開 (公開=FALSE) organization returns a clean not-found response, not a broken page
- [ ] A 共通QA row and a `個別QA_<識別子>` row in the same カテゴリ render together, 共通QA rows first, each group preserving its original sheet row order
- [ ] The refresh token lives in the Apps Script Script Properties and the Cloudflare secret store — never in a URL, query string, or committed file
- [ ] `README.md` exists at the project root with pnpm-based setup steps, separate from SKILL-driven output
- [ ] QA items render as accordions with a visible `+`/`−` state change and correct `aria-expanded`
- [ ] The category `<select>` and search box are both driven by the actual merged data, not hardcoded
- [ ] All colors are declared via `oklch()` custom properties, and the terracotta accent is used sparingly rather than as a section/card fill
