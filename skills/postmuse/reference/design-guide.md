# Design guide

## The one-glance test
A post is seen for under a second in a feed. Before you write HTML, decide:
- **The one idea:** what a viewer should take away.
- **The focal point:** the headline, the photo subject or a product. Only one.
- **The read order:** focal point → supporting line → brand/CTA. Make each step clearly smaller or quieter than the one before.

## Layout
- **Margins:** keep 60–100px of clear space from the frame edges on 1080-wide posts. Nothing important touches an edge unless it bleeds off on purpose.
- **Alignment:** pick one strong left edge (or a centered axis) and line things up on it. Mixed alignments look accidental.
- **Space:** give the headline room. Empty space reads as confidence, and filling every corner reads as noise.
- **Layering:** a photo at the back, a shape or card for contrast, then text, then one playful accent (sticker, sparkle, curved kicker) that overlaps an edge or tilts 3–10°.
- **Reliable compositions:**
  - *Big type:* a headline across 60–80% of the width, one accent word in the italic serif, a small kicker above, and the CTA or brand at the bottom.
  - *Photo + strip:* a full-bleed photo with a solid brand-color band (180–260px) holding the message and CTA.
  - *Card collage:* a white rounded card on a tinted background, with tilted props around it (notification, sticker, tape, sparkles).
  - *Split:* the photo on one half, type on the other.
  - *Quote:* a large quotation in serif italic, attribution small. Use real quotes only.
  - *List / tips (carousel):* a numbered headline on slide 1 and one tip per slide, with a consistent position for the number.

## Type
- **Headline:** 90–150px on 1080 wide, the heaviest weight, tight `line-height` (0.95–1.05) and slight negative `letter-spacing` (−2 to −5px). Break lines by meaning with `<br>`.
- **Accent word:** 1–2 words in the accent font (an italic serif works great), set 10–20% larger than the words around them, often in the accent color.
- **Body:** 28–40px, weight 500, line-height 1.3–1.45, under 20 words.
- **Kickers and labels:** 20–26px, uppercase, letter-spacing .2–.55em.
- **Legibility on photos:** pick a calm area of the image, or add a solid or translucent panel (`rgba` background with a 20–30px radius), or use a drop shadow. Never put text over a face.
- **Contrast:** dark text on light or light on dark, at least 4.5:1 for body text. Yellow on white fails.

## Color
- Use the brand palette: one dominant (usually the background), one accent for emphasis and CTA, and ink for text. Use a third color only for small accents.
- Make posts in a series feel related through the same palette, type scale and position of the brand mark.

## Copy
- Write in the brand's voice from `BRAND.md`. Keep it short: a headline of 3–8 words, a support line under 15 words, and one CTA.
- Make the post useful or fun: a feeling, a joke, a tip, a reminder, an invitation. Don't make it a feature list.
- Use only true claims from `BRAND.md`. No invented numbers, reviews, testimonials, prices or dates.
- A good CTA is concrete: "Join the waitlist", "Book your table", "Link in bio".
- If the user writes in another language or mixes languages, match them.

## Redesigning an inspo post
When the user shares someone else's post as inspiration:
1. Name the **concept** that makes it work (for example, "a reminder card with playful props", or "ghosts with curved captions").
2. Keep the concept. Rebuild **everything visual** in the user's brand: their palette, fonts, logo and voice.
3. Swap the props for ones relevant to the user's product (a notification from their app instead of an alarm clock, their product instead of a generic one).
4. Drop the original's logo, watermark, @handle and photos. Don't copy distinctive artwork or the exact layout one to one.
5. Rewrite the copy for the user's audience. Matching the joke's structure is fine, but the words should be theirs.

## Before you hand over
- Nothing important is within 60px of an edge, and nothing is cut off. Check curved text width too.
- Nothing overlaps unless on purpose, and no text sits on a busy part of a photo.
- The focal point is obvious at thumbnail size.
- Every editable part has a sensible `data-el` name.
- All copy is true and on-brand.
