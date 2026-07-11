# Frontend design

The rendering route (`src/pages/company.astro` or equivalent) is a utility
page — it should look and feel like an extension of Claude's own product
surface, not a generic marketing landing page. Consult the `frontend-design`
skill for general layout/typography judgment, but the specific direction for
*this* page is already decided below — don't reopen the palette or layout
concept, just execute it well.

## Layout

```
┌─────────────────────────────────────────┐
│  会社名 / 基本情報 (住所・電話・メール)      │
├─────────────────────────────────────────┤
│  [カテゴリ ▾] [ 🔍 検索窓               ]  │
├─────────────────────────────────────────┤
│  カテゴリA ─────────────────────         │
│   ▸ Q. 質問1                       [+]   │
│   ▸ Q. 質問2                       [+]   │
│  カテゴリB ─────────────────────         │
│   ▸ Q. 質問3                       [+]   │
└─────────────────────────────────────────┘
```

- One section per カテゴリ, in the order categories first appear across
  共通QA then 個別QA (共通QA rows populate a category first; 個別QA rows
  append into the same section when the category name matches).
- Each question is a disclosure/accordion item: collapsed by default,
  showing only the question text and a `+` indicator; expanding reveals the
  answer and swaps the indicator to `−`. Multiple items can be open at once
  — don't force accordion-per-section exclusivity, there's no reason to
  penalize a visitor for opening two answers.
- Search box and category `<select>` sit together above the sections,
  sticky on scroll for long pages. The `<select>` is populated from the
  categories actually present for this organization — never a hardcoded
  list, since 個別QA can introduce org-specific categories.
- Search filters by substring match against 質問 and 回答 (case-insensitive).
  Filtering hides non-matching items and any category section left empty by
  the filter; it does not need to hit the server — do it client-side against
  the already-rendered data.
- Selecting a category from the dropdown scrolls to / isolates that section.
  Combine naturally with search rather than treating them as separate modes.

## Accessibility baseline

- Each accordion trigger is a real `<button>` with `aria-expanded` reflecting
  state, not a `<div onclick>`.
- The `+`/`−` glyph is decorative (`aria-hidden="true"`) — the accessible
  state comes from `aria-expanded`, not the glyph.
- Visible keyboard focus on the search input, dropdown, and every accordion
  button.
- Respect `prefers-reduced-motion` — the expand/collapse transition should
  become an instant show/hide rather than animating.

## Color: oklch, based on Claude's own product palette

Define every color as a CSS custom property in `oklch()`, not hex — this
keeps the palette easy to nudge (adjust chroma/lightness independently)
without re-deriving hex codes. The palette below is calibrated to Claude's
own warm, restrained interface look: a warm off-white surface, warm-gray
ink, and a single terracotta accent used sparingly (active/selected states,
focus rings, the accordion indicator) rather than as a dominant color.

```css
:root {
  --color-bg:        oklch(95.9% 0.010 87.5);   /* warm cream page background */
  --color-surface:    oklch(98% 0.005 87.5);     /* card/section background, slightly lighter than bg */
  --color-border:     oklch(88.4% 0.018 81.3);   /* hairline borders between sections/items */
  --color-ink:        oklch(26.2% 0.007 67.5);   /* primary text */
  --color-ink-muted:  oklch(53.7% 0.019 70.3);   /* secondary text: category labels, contact info */
  --color-accent:      oklch(67.2% 0.131 38.8);   /* terracotta — accent only, not backgrounds */
  --color-accent-ink: oklch(98% 0.005 87.5);      /* text/icon color when sitting on --color-accent */
}
```

Usage rules:
- `--color-accent` is for: the focused/expanded accordion `+`/`−` indicator,
  the search input's focus ring, the active state of the category dropdown,
  and small dividers/rules — never as a large fill (no accent-colored
  section backgrounds or buttons-as-blocks).
- Body text sits on `--color-bg` or `--color-surface` using `--color-ink`;
  never place body text directly on `--color-accent`.
- If the organization's brand later needs its own accent color layered in
  (out of scope for now), swap only `--color-accent`/`--color-accent-ink` —
  everything else should be brand-neutral.

## Typography

Match Claude's product UI rather than a marketing-site display face: one
warm, humanist sans-serif carries both headings and body copy, leaning on
weight and size rather than a second typeface for hierarchy. Use a system
font stack so there's no webfont loading cost on a page that's meant to be
fast and low-maintenance:

```css
--font-sans: ui-sans-serif, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
```

- 会社名 / page heading: larger size, medium-to-semibold weight.
- カテゴリ headers: small caps or a slightly muted/uppercase treatment using
  `--color-ink-muted`, functioning as section labels rather than competing
  with the questions themselves for attention.
- 質問 (accordion trigger) text: regular-to-medium weight, `--color-ink`.
- 回答 body text: regular weight, comfortable line-height (~1.6) since
  answers can run long.

## What not to do here

- Don't reach for the generic AI-design defaults called out in the
  `frontend-design` skill (near-black + neon accent, or dense
  broadsheet/newspaper layout) — this page's direction is already set above.
- Don't use the terracotta accent as a background fill for whole sections or
  cards; it reads as a warning/CTA color when overused and this is a
  reference/utility page, not a conversion page.
- Don't hardcode the category list in markup or in the `<select>` — always
  derive it from the merged 共通QA + 個別QA data for the current organization.
