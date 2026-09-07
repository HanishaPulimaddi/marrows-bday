# Birthday site

A four-section, full-screen vertical scroll experience — hero, reasons, letter,
and a gift box that opens. Static, no build step, no dependencies. Deploys to
Cloudflare Pages as-is.

```
index.html      the whole site (styles + content config + markup renderer)
app/index.html  stub route for the future reminder PWA ("One more thing →")
img/            (create this) drop your photos here
```

## Changing the words

Everything readable lives in the `CONTENT` object near the top of the `<script>`
in `index.html` — name, date, the hero message, the six captions, the letter
paragraphs and sign-off, the gift copy, the swipe hint, and every button label.
Nothing is hard-coded in markup.

Headings accept inline HTML, which is how the serif mixes upright and italic:

```js
title: "A <em>Letter</em> for You"
```

### Where the last button goes

The letter's "One more thing →" scrolls on to the gift section, because the gift
is what comes after it:

```js
moreHref: "#gift"    // set to "/app/" to skip the gift and jump straight there
```

The gift's own "Open your gift →" is the one that navigates to `/app`
(`CONTENT.gift.ctaHref`).

## Photos

Originals live in `Images/`. What the site actually loads is `img/` — the same
photos cropped to each slot's exact ratio and saved at roughly twice their
display size (5.8 MB of originals become about 840 KB).

All paths live in the `IMAGES` object directly below `CONTENT`:

```js
const IMAGES = {
  heroPortrait: 'img/hero.jpg',        // 3:4
  reasons:      [ ...six... ],         // 1:1, one per caption
  polaroids:    [ ...any number... ],  // 3:4, the stack down the left
  polaroidHero: 'img/polaroid-hero.jpg'// 2:3, the big one over the stack
};
```

Set any entry to `null` and that slot falls back to a labelled grey placeholder,
so photos can be swapped in one at a time.

`polaroids` takes **any number** of photos — the collage solves its own layout in
`stackLayout()`, sizing and overlapping the frames so the run always fills the
column. Add a fourth and it re-spaces itself; nothing else needs touching.

### Re-cropping

Slots have fixed ratios (3:4 hero, 1:1 reasons, 3:4 polaroids, 2:3 the big one),
so the photos are pre-cropped to match rather than letting `object-fit` guess.
The crop keeps the middle of the frame by default; the `focus` value in the crop
script biases it along the cropped axis (`0` = top/left, `1` = bottom/right),
which is how the faces were kept in frame on the tall and very wide shots.

The hero is an ordinary photograph, not a background-removed cut-out. It's
desaturated in CSS, and its top and right edges are feathered with a two-layer
mask so it melts into the paper instead of reading as a pasted rectangle — the
left and bottom edges bleed off the card and are clipped there.

## Running it locally

```
python -m http.server 4173
```

Then open <http://127.0.0.1:4173/>. Any static server works; you need one
(rather than opening the file directly) so that `/app/` resolves.

## Deploying to Cloudflare Pages

Direct upload, or connect the repo:

- Build command: *(none)*
- Build output directory: `/` (the project root)

`/app/` is served automatically from `app/index.html`.

## The gift section

Tapping the box (or the **Open** button) lifts the lid, throws ~24 confetti
pieces, fades the box out, and fades in the message and the link to `/app`. The
whole sequence finishes in about 1.9s. A **replay** link underneath resets it to
the closed state so it can be shown to someone else.

The box, its ribbon and bow are inline SVG in two layers sharing one viewBox —
`BOX_BODY` and `BOX_LID` — so the lid always lands on the body no matter the
size. Confetti is 24 `<i>` elements animating transform and opacity only; no
canvas, no library.

Under `prefers-reduced-motion: reduce` there is no confetti and no lid flight —
the box cross-fades to the message over 250ms.

## /app — the reminder PWA (phase 1)

An installable notes-with-reminders app, one screen. Files:

```
app/index.html   markup
app/app.css      styles
app/app.js       all behaviour (ES module)
app/sw.js        service worker — offline shell
app/manifest.json
app/icons/       192 and 512 png, full-bleed so a maskable crop is safe
app/vendor/idb.js  idb 8.0.3, vendored (no build step, works offline)
```

Notes live in IndexedDB under the database `lists`, store `notes`:

```
{ id, text, dueAt, sent, createdAt, updatedAt, deleted }
```

`dueAt` is epoch milliseconds or `null`. No timezone and no formatted time is
ever stored — local time is produced at display time with `Intl.DateTimeFormat`.
Deletes are soft (`deleted: true`), which is what makes the 5-second undo work.

### Deploying / bumping the service worker

**Bump `VERSION` at the top of `app/sw.js` on every deploy.** It names the caches;
if it doesn't change, browsers keep serving the old shell.

Installing on Android needs HTTPS, so the install prompt only appears on the
deployed Pages URL, not over plain http from another machine on the LAN.

## Notes

- Paper textures are generated entirely in CSS — layered gradients plus inline
  SVG `feTurbulence` as data URIs. No texture images to host or load.
- Every doodle, polaroid accent, washi tape strip and wax seal is inline SVG.
- Only external requests are the two Google Fonts (Cormorant Garamond, Poppins).
- `prefers-reduced-motion: reduce` disables all animation, all transitions, and
  smooth scrolling; every element renders in its final state.
