# Atelier

Your local studio for social media posts designed by **Postmuse**.

```bash
npm install     # first time only
npm start       # → http://localhost:4747
```

Set `PORT=5000 npm start` to use another port.

## Making posts
Ask Claude, with the Postmuse skill installed, for a post: "make a launch post for our new cold brew, square, with this photo". It writes the post to `posts/<slug>/`, and the post appears on Atelier's home page. You can also start a **New blank post** from the home page.

## Editing
- **Select:** click anything, or pick it in Layers.
- **Move:** drag it, or use the arrow keys (⇧ for 10px steps).
- **Resize:** drag the handles. The corner handle keeps a photo's proportions.
- **Retype:** double-click text, or select it and press Enter. Enter adds a line break and Esc finishes.
- **Panel:** position, size, rotation, opacity, font, size, weight, colors (with your brand swatches) and corner radius.
- **Curved text:** edit the words and use the curve slider.
- **Photos:** + Image and Replace open your photo library (pick a photo or upload a new one). Fit (crop or show all), focus sliders to reframe, and Adjust (brightness, contrast, saturation, warmth, hue, black & white, blur). Drop an image file onto the post to add it, or onto a photo to replace it.
- **Add things:** + Text, + Shape, + Image.
- **Shortcuts:** ⌘Z / ⇧⌘Z undo and redo, ⌘D duplicate, Delete removes, ⌘S saves.
- **Export PNG:** downloads the post at full size.

## Photos
Every post draws from one photo library in `photos/`. Open **Photos** in the top bar to:
- **Organize:** create folders, rename them, and move photos by dragging them onto a folder (or with **Move to…**).
- **Clean up:** delete photos you don't need, or a whole folder. A photo a post still uses can't be deleted; remove it from the post in the editor and save first.
- **Upload:** **Upload photos**, or drop image files onto the grid.

Moving a photo or renaming a folder updates the saved posts that use it. Save any open post first, so an older copy doesn't overwrite the update.

Changes are written to `posts/<slug>/post.html` when you **Save**, and Claude reads them back next time.

## Check a post
```bash
npm run check              # brand fonts + every post
npm run check -- my-post   # one post
```

## Photo tool
```bash
npm run photo -- input.jpg photos/my-post/photo.jpg --size 1080x1350 --focus 50,35 --warmth 20 --contrast 1.1
npm run photo -- --help
```

## Folders
```
brand/      brand.json (colors, fonts, logo), BRAND.md (voice, true claims), logo files
posts/      one folder per post: post.html, post.json
photos/     the photo library: one level of folders (photos/<folder>/<file>)
editor/     the Atelier editor
scripts/    photo.mjs (photo edits), check.mjs (post and font checks)
server.js   local server (no framework)
```
