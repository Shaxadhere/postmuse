# Postmuse ✦ Atelier

**Postmuse** is a Claude skill that designs social media posts. Tell Claude what you want ("a launch post for our new menu, with this photo"). Postmuse sets up your brand kit, edits your photos and designs the post.

**Atelier** is the small editor Postmuse gives you. Run `npm start` and finish the post in your browser: drag things around, retype, recolor, adjust photos and export a PNG.

## Install the skill

### Option A: as a Claude Code plugin (recommended)
Inside Claude Code:
```
/plugin marketplace add <your-github-user>/postmuse
/plugin install postmuse@postmuse
```

### Option B: copy the skill folder
```bash
git clone https://github.com/<your-github-user>/postmuse.git
mkdir -p ~/.claude/skills
cp -R postmuse/skills/postmuse ~/.claude/skills/postmuse
```
Restart Claude Code. The skill is now available in every project.

You need **Node.js 18+**. Postmuse creates an `atelier/` folder in your current directory the first time you use it.

## Use it
Open Claude Code in the folder where you want your posts to live and ask:

- “Postmuse, set up my brand kit. We're Brew & Co, a neighborhood coffee shop. Here's our logo: ./logo.png”
- “Make an Instagram post announcing our new oat-milk cold brew, with this photo: ./coldbrew.jpg”
- “Redesign this inspo for our brand” (attach an image)
- “Three variations of a story saying we're closed Monday”
- “Crop my photo for a square post and make it warmer”
- “Turn our 5 brewing tips into a carousel”

Then:
```bash
cd atelier
npm start
```
Open http://localhost:4747, click the post and finish it. Click **Save** to keep your edits and **Export PNG** to download.

## What's inside
```
.claude-plugin/            plugin + marketplace manifests
skills/postmuse/
  SKILL.md                 how Claude runs Postmuse
  reference/               post format, design guide, brand-kit setup
  template/                the Atelier studio that gets copied into your project
    server.js              local server (no framework)
    editor/                the browser editor
    scripts/photo.mjs      photo crop/color/stylize tool (sharp)
    brand/                 brand.json + BRAND.md (filled in for you)
    posts/                 your posts
```

## Limits
- It can't remove backgrounds or objects, do generative fill or retouch faces. Do that in a photo editor first, then hand Postmuse the result.
- Fonts come from [Fontsource](https://fontsource.org), which covers all of Google Fonts. Custom licensed fonts aren't supported yet.
- Export is PNG at the post's native size.
