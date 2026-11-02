# Brand kit

The brand kit lives in the studio's `brand/` folder:

```
brand/
  brand.json   colors, fonts, logo path. The editor reads this for swatches and font menus.
  BRAND.md     who the brand is, voice, true claims, things to never say, look and feel
  logo.png     (and any other shared brand images)
```

## brand.json
This example shows the **shape only**. Don't reuse its name, colors or fonts: choose them for the real brand.
```json
{
  "name": "Example Co",
  "handle": "",
  "website": "",
  "logo": "/brand/logo.png",
  "colors": [
    { "name": "Ink", "hex": "#123456" },
    { "name": "Paper", "hex": "#fafafa" },
    { "name": "Accent", "hex": "#e0457b" },
    { "name": "Support", "hex": "#3bb8a8" },
    { "name": "White", "hex": "#ffffff" }
  ],
  "fonts": [
    { "name": "Display", "family": "Example Display", "package": "example-display", "weights": [700, 900], "italic": true },
    { "name": "Body", "family": "Example Sans", "package": "example-sans", "weights": [400, 500, 700], "italic": false }
  ]
}
```
- **`handle`, `website`:** only fill these in if the user gave them. Leave them empty otherwise.
- **`name`:** non-empty means the kit is set up. Leaving it empty shows a "set up your brand kit" banner in Atelier.
- **Colors:** 3–7 entries, with names that say their role. The editor uses names matching *ink/text* for default text color, *paper/background/base* for new post backgrounds, and *accent/primary/brand* for new shapes.
- **Fonts:** `name` is the role (`Display`, `Body`, `Accent`). The editor uses `Display` for new text. `family` is the CSS family name. `package` is the [Fontsource](https://fontsource.org) package id: lowercase and hyphenated, usually the Google Fonts name, e.g. `dm-sans`, `playfair-display`, `space-grotesk`. `italic`: `true` loads normal and italic, `"only"` loads italic only, and `false` loads normal only.

## Installing fonts
Fonts are served locally so PNG export can embed them. For each font package:
```bash
npm install @fontsource/<package>
```
Then run `npm run check`. It confirms that every weight and style you listed has a font file, and tells you the install command for anything missing. To see which weights a package actually ships, run `ls node_modules/@fontsource/<package>/files | grep -- '-latin-'`.

Atelier builds `/brand/fonts.css` from `brand.json` automatically, so you never write `@font-face` rules yourself.


- Atelier only loads static `@fontsource/…` packages, not `@fontsource-variable/…` ones. Before choosing a family, check that `npm view @fontsource/<package> version` succeeds.
- Custom or licensed fonts that aren't on Fontsource can't be loaded yet. Pick the closest free match and tell the user.
- Remove fonts you no longer use from `brand.json`. You can leave the packages installed.

## Logo
- Copy the user's logo into `brand/` (`logo.png` or `logo.svg`) and set `"logo": "/brand/logo.png"`.
- Keep its aspect ratio when placing it. Check the size with `npm run photo -- brand/logo.png /tmp/x.png` or `sips -g pixelWidth -g pixelHeight` (macOS).
- If you need a light version for dark backgrounds and only have a dark logo, ask for one rather than recoloring it.

## BRAND.md
Fill these sections in from what the user tells you and what you can see. Keep it short and factual:
- **Who we are:** one or two sentences: what it is, for whom, and where.
- **Voice:** 3–5 adjectives plus one example line.
- **Things we can say:** confirmed facts, offers, dates and links, with the date you were told.
- **Things we never say:** claims to avoid and touchy topics.
- **Look and feel:** recurring motifs, photo style, things that are on-brand and off-brand.

## Picking a palette and fonts for the user
When the user says "pick for me":
- Base it on the product and audience. A cafe might get warm neutrals with a terracotta accent. A fintech might get deep navy with an electric accent and lots of white. A Gen-Z social app might get a bold saturated primary with a sunny yellow.
- Choose one display font with personality and one plain body font. An accent script or italic serif is optional.
- Check contrast: ink on paper at least 7:1, and white on accent at least 4.5:1.
- Tell the user what you picked in one line, and that they can change it any time.
