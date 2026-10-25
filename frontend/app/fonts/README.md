# Self-hosted fonts

The CSP is `font-src 'self'`, so fonts must be served from this folder. `css/base.css` expects these five WOFF2 files
(variable fonts, weight axis 400-700). They are not committed; add them before release. Until then the UI falls back to the
system font stack from `css/tokens.css`.

| File | Family | Notes |
|---|---|---|
| `inter-var.woff2` | Inter | Latin, upright |
| `source-serif-4-var.woff2` | Source Serif 4 | Latin, upright (reading text) |
| `source-serif-4-italic-var.woff2` | Source Serif 4 | Latin, italic |
| `noto-sans-devanagari-var.woff2` | Noto Sans Devanagari | Hindi UI text, U+0900-097F |
| `noto-serif-devanagari-var.woff2` | Noto Serif Devanagari | Hindi reading text, U+0900-097F |

## Where to get them (all SIL Open Font License 1.1)

- Google Fonts (https://fonts.google.com): download each family, then convert the variable TTF to WOFF2
  (for example `woff2_compress`, or https://github.com/google/woff2).
- Fontsource (https://fontsource.org): `npm i @fontsource-variable/inter @fontsource-variable/source-serif-4
  @fontsource/noto-sans-devanagari @fontsource/noto-serif-devanagari` and copy the `*.woff2` files from
  `node_modules/@fontsource*/files/` (pick the `wght-normal` / `wght-italic` variable files where available) to this folder
  with the names above.

Keep the OFL licence text with the files (for example `fonts/OFL.txt`).
