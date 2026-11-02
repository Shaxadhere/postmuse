---
name: postmuse
description: Design on-brand social media posts (Instagram, stories, LinkedIn, X, Pinterest) from a prompt, an inspiration image or the user's own photos; edit those photos; and hand the user Atelier, a local browser editor (`npm start`) to finish and export them. Use when someone asks for a social post, carousel slide, story, announcement graphic or promo image, wants an inspo post redesigned for their brand, wants their photos made post-ready, or wants to set up or change their brand kit.
---

# Postmuse

Postmuse designs the post. **Atelier** is the small local editor the user opens with `npm start` to move things around, retype text, adjust photos and export a PNG. You build every post as an Atelier post, so whatever you make stays editable.

The `template/` folder next to this file is a complete Atelier studio. The `reference/` folder holds the details you'll need:
- `reference/post-format.md`: the exact HTML rules the editor needs. Read it before writing any post.
- `reference/design-guide.md`: layout, type and copy craft, and how to redesign an inspo post.
- `reference/brand-kit.md`: setting up `brand/brand.json`, fonts and the logo.

## 1. Find or create the studio
Look for `atelier.json` in the current folder, then in `./atelier/`. That folder is the studio.

If there isn't one, create it:
1. Copy this skill's `template/` folder to `./atelier`. Use a different place only if the user named one, and never copy `template/node_modules`. For example: `rsync -a --exclude node_modules "<skill dir>/template/" ./atelier/`.
2. Run `npm install` inside it. It can take up to a minute on a first install, so start it in the background and keep working. npm notes about funding or install scripts are expected and harmless.
3. Tell the user in one line where Atelier lives.

The template includes a sample post, `posts/welcome-to-atelier`. Delete it once you've set up the user's brand, because it uses the default fonts.

All paths below are relative to the studio folder.

## 2. Make sure there's a brand kit
Read `brand/brand.json` and `brand/BRAND.md`. If `"name"` is empty, set up the brand before the first post (see `reference/brand-kit.md`):
- Use what the user already gave you: a website, logo file, screenshots or past posts. Pull colors, fonts and voice from those.
- **The brand name is the only thing you can't decide yourself.** If it's missing, ask. Everything else has a default:
  - No colors or fonts given: choose them to fit the brand, and say what you chose.
  - No logo: leave `"logo"` empty and set the brand name as a text wordmark in posts. Tell the user they can add a logo later.
  - No handle or website: leave them empty. Never invent them.
- Never invent facts about the brand: prices, launch dates, user counts, awards, reviews. Put the true facts the user gives you in `BRAND.md` under "Things we can say".
- Install the fonts and run `npm run check` (it confirms the font files exist).

When the user asks to change their brand, edit `brand.json` and `BRAND.md` the same way.

## When to ask and when to build
Build by default: making a post the user can then edit beats asking questions. Stop and ask (all your questions in one message) only when:
- the brand name is unknown;
- a photo has another brand's logo, watermark or text baked in, or you can't tell whether the user has the rights to it;
- a photo clearly doesn't show what the post is about (for example, a screenshot used for a product announcement).

If the user has said "just go" or you can't reach them, build anyway. Use a **photo placeholder** in place of the problem photo: a solid brand-color `<div data-el="Photo placeholder">` with a short label like "Your photo here", in the photo's position and size. Then say clearly what you replaced and why. In Atelier the user can delete the placeholder and drop their photo in.

## 3. Design the post
1. **Read the brief.** It might be an idea in words, an inspo image to redesign, the user's photos to build around, or a change to an existing post. Default size is Instagram portrait 1080×1350. Use 1080×1080 for square, 1080×1920 for a story or reel cover, and 1200×675 for X or LinkedIn landscape. If the brief is clear, build it and state your assumptions in one line. Don't stop to ask.
2. **Plan, briefly and in your head.** Decide on one idea, one focal point, a headline of 3–8 words, and at most 2–3 supporting elements. Follow `reference/design-guide.md`.
3. **Prepare photos** (section 4).
4. **Write** `posts/<slug>/post.json` and `posts/<slug>/post.html`, following `reference/post-format.md` exactly. Slugs are lowercase words joined by hyphens.
5. **Variations:** when the user asks for options, or the brief is open, make 2–3 posts with different slugs (`-a`, `-b`, `-c`). Vary the layout and the headline, not just the color.
6. **Carousels:** one post per slide (`<slug>-1`, `<slug>-2`, …), all the same size, sharing one design system.

## 4. Edit photos
The user's photos go into `posts/<slug>/assets/`. Never edit the originals in place.

- **Crop, reframe, resize and strong styles:** use the bundled script, which writes a new file. Crop to the **size of the photo's slot** in your layout, not always the full post. A photo above a 470px text band in a 1080×1350 post is 1080×880:
  ```bash
  npm run photo -- <in> posts/<slug>/assets/<name>.jpg --size 1080x880 --focus 50,35
  ```
  Other options: `--zoom`, `--contain --pad-color`, `--rotate`, `--flip`, `--grayscale`, `--duotone A,B`, `--tint HEX`, `--blur`, `--sharpen`, `--vignette`, `--round`, plus color controls. Run `npm run photo -- --help` for the full list. Set `--focus` to where the subject is (faces, product) so the crop keeps it.
- **Avoid big enlargements.** If the source is much smaller than the slot (more than about 1.3× upscaling), pick a layout with a smaller photo slot, or add `--sharpen` and tell the user it may look soft.
- **Subjective tweaks** ("warmer", "brighter", "moodier", "more vivid") go on the `<img>` as a CSS `filter` (see post-format.md), not baked into the file, so the user can fine-tune them with sliders in Atelier. Start subtle: `brightness(105%)`, `contrast(108%)`, `saturate(115%)`, `sepia(15%)` for warmth. Bake color into the file with the script only for stylized looks (duotone, tint, B&W) or when the user asks for a finished file.
- **Look at the photo before designing on it.** Find where the subject is and where there's calm space for text, and keep text off faces.
- **Can't do here:** background removal, object removal, generative fill or face retouching. Say so, and suggest a photo editor for that step. Then build around the result.
- **Rights:** use the user's own photos, or ones they confirm they're allowed to use. If an inspo image is someone else's post, take the idea and not their photo, logo or watermark. For a photo with another brand's logo or text baked in, or one that doesn't match the post, see "When to ask and when to build" above.

## 5. Check your work
1. Run `npm run check -- <slug>`. Fix every ✗. Fix each ⚠ too, unless it's intentional (for example, a decorative shape bleeding off the edge).
2. If you can view web pages (a browser or preview tool), start the studio with `npm start` (port 4747, or set `PORT`) and run it in the background. Open `http://localhost:4747/?post=<slug>`, take a screenshot and fix what's wrong: text running off the edge or overlapping, low contrast, crowded corners, an unclear focal point.
3. If you can't view pages, estimate text sizes with the rules in post-format.md ("Estimating text size") and leave generous room. Then tell the user you couldn't preview it and that they should check it in Atelier.

## 6. Hand over
Reply with:
- what you made, in one or two lines, and the headline copy;
- any assumption you made, and anything you couldn't do (for example, background removal);
- how to finish it: `cd <studio>` → `npm start` → open `http://localhost:4747/?post=<slug>`. Mention that edits persist only after **Save**, and that **Export PNG** downloads the final image.

## Changing a post later
The user may have edited and saved the post in Atelier. Always re-read `posts/<slug>/post.html` before changing it. Change only what was asked, and keep their positions, wording and photos everywhere else.
