# Fortune design system

Fortune's web identity is a white porcelain canvas with lacquer red and gold
foil, taken from the approved lucky-cat artwork in `public/`. Everything lives in
`app/globals.css` as tokens plus the component classes the pages already use, so
pages restyle without changing their data or wallet logic.

## Tokens

| Token | Light | Use |
| --- | --- | --- |
| `--red` | `#d8141d` | Primary accent, links, focus ring |
| `--red-lacquer` | `#e8262f → #c80f18` | Primary buttons, step and token seals |
| `--gold` / `--gold-bright` | `#c8913f` / `#f2c46d` | Hairlines, diamonds, coin rims (decorative only) |
| `--gold-ink` | `#85581b` | Gold text on white (6:1 contrast) |
| `--jade` | `#177a55` | Pass / graduated / verified states |
| `--amber` | `#a15c07` | Warnings and pending states |
| `--ink` / `--muted` | `#221515` / `#7b6564` | Text (muted still clears 5:1) |

Red is the brand, so errors never rely on red alone: error notices also use a
darker stamp, an inset rule and explicit wording. Dark mode ("lacquer night")
overrides the same tokens under `html[data-theme="dark"]`.

## Type

- **Fraunces** (soft axis on) for headlines and numbers people should notice.
- **Plus Jakarta Sans** for UI and body copy. Its contextual alternates are
  disabled because they render `0x` as `0×`, which would corrupt addresses.
- Both are OFL fonts loaded with `next/font/google`: they are downloaded at build
  time and served from Fortune's own origin, so browsers never call a font CDN.
  Chinese falls back to Songti / Noto Serif SC for headings and PingFang / YaHei /
  Noto Sans SC for text.

## Motifs

- **Fortune coin** (`components/Ornaments.tsx`): red disc, gold rim, square hole.
  Used as the brand seal, list bullets and empty states; token avatars and form
  step numbers use the same coin treatment in CSS.
- **Auspicious cloud**: gold line cloud for decorative corners.
- **Meander band**: gold 回 key pattern that tops the red footer.
- **Fortune slip**: cream paper notice with a red stamp label (`.registryNotice`),
  used for network, release and data-state messages.
- **Moon gate**: the arched, double gold-ringed frame around the hero artwork.

All motifs are decorative and hidden from assistive technology.

## Conventions

- Keep honest data states: unavailable, pending and research labels stay visible.
- User-supplied values (token names, URIs) carry `translate="no"` so the 中文
  switch never rewrites them.
- Decorative art below the fold uses `loading="lazy"`; React emits preload hints
  for eager images in server components, including the not-found page, so keep
  shared-boundary art lazy.
- Layout breakpoints: 1180px (header collapses to a menu), 1080px (launch preview
  hides, docs contents move inline), 920px (single-column sections), 760px (phone).
