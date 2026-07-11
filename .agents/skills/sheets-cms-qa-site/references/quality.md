# Quality gates: type checking and lint

This project's data source is a spreadsheet non-engineers edit freely.
TypeScript and lint catch mistakes in the code you write; they cannot catch
a category cell left blank or a 公開 column containing something other than
TRUE/FALSE. Treat static checks and runtime validation as two separate,
both-required layers — see the last section here, and
`references/refresh-api.md` for the validation this implies for the sync
logic specifically.

## Type checking

- `tsconfig.json` should extend `astro/tsconfigs/strict` (this is
  `create-astro`'s default — if a project has weakened it to `base` or
  `loose`, put it back to `strict`).
- Cloudflare bindings (`Astro.locals.runtime.env.DB` and friends) have no
  type information until you generate it. Add a script and run it once
  after any binding changes in `wrangler.jsonc`:

  ```json
  { "scripts": { "generate-types": "wrangler types" } }
  ```

  This writes `worker-configuration.d.ts`. Without it, `env.DB` is
  untyped — a typo'd column name in a SQL query, or a missing await,
  won't be caught.
- `tsc` alone does not check the template portion of `.astro` files. Use
  `astro check` as the real type-checking command:

  ```json
  { "scripts": { "typecheck": "astro check" } }
  ```

## Lint

- Use ESLint with `typescript-eslint` and `eslint-plugin-astro` together —
  the Astro plugin alone won't catch TypeScript-specific issues in
  frontmatter, and typescript-eslint alone won't lint `.astro` files.
- Non-negotiable rules for this project (turn these on even if the rest of
  the config is left at defaults):
  - **no-floating-promises** — the refresh API and D1 calls are all async;
    a dropped `await` here fails silently and corrupts data rather than
    throwing.
  - **no-explicit-any / no-unsafe-\*** — data arriving from the Sheets API
    is untyped JSON. Letting it flow through as `any` defeats the purpose
    of type checking exactly where it matters most (see the runtime
    validation note below).
  - **no-unused-vars**
- Add the lint script:

  ```json
  { "scripts": { "lint": "eslint ." } }
  ```

## Combined verification

```json
{ "scripts": { "verify": "pnpm typecheck && pnpm lint" } }
```

Run `pnpm verify` after any implementation pass and treat it as done only
when it exits clean — not "mostly clean" or "pre-existing errors only."

## Static checks are not enough for this project

TypeScript and lint check the code you wrote. They say nothing about the
spreadsheet data flowing through it, because that data has no compile-time
type — it's whatever a non-engineer typed into a cell. A category column
that's blank, a 公開 column containing "はい" instead of TRUE/FALSE, or a
`個別QA_<識別子>` tab whose suffix doesn't match any 設定 row — none of
these are lint errors, and all of them are bugs the refresh API must catch
at runtime.

This is why `references/refresh-api.md` requires explicit validation
before any D1 write, and why the validation checklist in `SKILL.md`
includes runtime cases (orphaned tabs, missing categories) alongside the
build checklist. Passing `pnpm verify` is necessary but not sufficient —
don't treat a clean type-check/lint run as evidence the refresh logic is
safe against bad sheet data.
