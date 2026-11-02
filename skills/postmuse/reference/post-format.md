# Atelier post format

Each post lives in `posts/<slug>/`:

```
posts/<slug>/
  post.json     { "title": "Short name", "idea": "One line on the idea", "format": "instagram-portrait" }
  post.html     the post itself (rules below)
  assets/       photos and images for this post only
```

## post.html
`post.html` holds **one root element and nothing else**: no `<html>`, `<head>`, `<style>`, `<script>` or comments outside the root.

```html
<div data-post data-w="1080" data-h="1350" style="position: relative; overflow: hidden; width: 1080px; height: 1350px; background: #f6f2ea; font-family: 'Inter', sans-serif; color: #16161d;">
  <div data-el="Headline" style="position: absolute; left: 90px; top: 420px; font-weight: 900; font-size: 120px; line-height: 0.95; letter-spacing: -4px; white-space: nowrap;">Big idea<br>goes here.</div>
</div>
```

### Rules the editor relies on
1. **`data-el="Readable name"` on every part the user might touch.** These names appear in the Layers list, so make them unique and human ("Headline", "Price tag", "Photo"). Purely structural wrappers don't need one.
2. **Top-level parts are `position: absolute` with `left` and `top` in px.** Add `width` and `height` wherever size matters. Don't use `right` or `bottom` anchoring, `translate`, or `margin` for positioning. `transform` is only for `rotate(Ndeg)`.
3. **All styling goes inline in `style="…"`.** No classes, no CSS variables, no `<style>` blocks. Use the hex values from `brand/brand.json`.
4. **Nesting is fine.** Inside an absolute element you can use flex or grid freely: a card holding a row of buttons, or a circle sticker centering its text with `display: flex; align-items: center; justify-content: center`. Nested children with `data-el` can be selected, retyped and restyled, and they move with their absolute parent.
5. **Text is literal markup.** Use `<br>` for line breaks and `white-space: nowrap` on headlines whose line breaks you control. For an accent word, wrap it in a `<span style="…">` with its own font, style or color. Use `div` for text by default. If you use `h1`–`h6` or `p`, add `margin: 0`.
6. **Fonts:** only the families listed in `brand/brand.json` are loaded. Use them by name with a generic fallback: `font-family: 'Inter', sans-serif`. Use only the weights listed there.
7. **No emoji and no icon fonts.** They export inconsistently. Use shapes, inline SVG or words instead.
8. **Nothing external.** No remote URLs. Images are `assets/<file>` (this post) or `/brand/<file>` (logo and shared brand files).

### Images
```html
<img data-el="Photo" src="assets/photo.jpg" alt="What the photo shows" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1350px; object-fit: cover; object-position: 50% 40%;">
```
- Always give an explicit `width` and `height`. Use `object-fit: cover` to fill a frame. `object-position` is the focus point, which the user can move with sliders.
- Optional adjustments the user can tweak with sliders: `filter: brightness(110%) contrast(110%) saturate(120%) sepia(15%) hue-rotate(0deg) grayscale(0%) blur(0px);`. Include only the ones you change.
- Rounded photo: `border-radius: 32px`. Logo: `<img data-el="Logo" src="/brand/logo.png" …>` with width and height that keep its ratio.

### Curved text
The editor draws the arc itself, so write exactly this shape:
```html
<svg data-el="Kicker" data-curve data-bend="80" role="img" aria-label="the text" style="position: absolute; left: 100px; top: 120px; width: 700px; height: 200px; overflow: visible;"><path fill="none"></path><text fill="#16161d" text-anchor="middle" style="font-family: 'Instrument Serif', serif; font-style: italic; font-size: 64px;"><textPath startOffset="50%">the text</textPath></text></svg>
```
- `data-bend` is the arch height in px. Negative values curve downward like a smile.
- The text sits on the arc along the bottom of the box, so make `height` at least the bend plus the font size.
- Text longer than the arc is cut off, so make `width` generous: roughly characters × font size × 0.5, plus 20%.
- Optional legibility on photos: `filter: drop-shadow(0 2px 8px rgba(0,0,0,.45))` in the svg's style.

### Shapes and decoration
- Rectangle or pill: a `div` with `background` and `border-radius` (999px for a pill).
- Circle: `border-radius: 50%` with equal width and height.
- 4-point sparkle: `clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)`.
- Sticker: a rotated (`rotate(-8deg)`) pill or rounded box with a soft `box-shadow`.
- Lines and dividers: a thin `div` (`height: 3px`).

### Estimating text size (when you can't preview)
- **Width of one line** ≈ characters × font-size × ratio, plus letter-spacing × characters. Typical ratios:
  - 0.52 for regular or medium sans;
  - 0.58 for bold or black sans;
  - 0.45 for serif italic;
  - 0.62 for wide display faces;
  - 0.75 for uppercase sans.
- **Height of a block** ≈ lines × font-size × line-height.
- **Wrapping text** (a box with a `width` and no `nowrap`): lines ≈ ceil(estimated single-line width ÷ box width). Prefer explicit `<br>` and `nowrap` for headlines, so wrapping never surprises you.
- Leave at least 10% slack on both. Estimates are rough, so tell the user to check the post in Atelier.

### Sizes
| Format | data-w × data-h | `format` value |
|---|---|---|
| Instagram / Facebook portrait | 1080 × 1350 | `instagram-portrait` |
| Square | 1080 × 1080 | `square` |
| Story / Reel cover / TikTok | 1080 × 1920 | `story` |
| X / LinkedIn landscape | 1200 × 675 | `landscape` |
| Pinterest | 1000 × 1500 | `pin` |

Stories: keep text and buttons out of the top 250px and the bottom 300px, where the app UI covers them.
