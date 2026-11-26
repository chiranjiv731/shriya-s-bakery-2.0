# Project notes

## Shirya's Bakery frontend

- Static site, no build step. Pages: `index.html`, `menu.html`, `order.html`
  (pickup checkout), `contact.html`, `credits.html` (photo attribution).
  All styling lives in `design-tokens.css`; all behaviour in `site.js`.
- Pages reference each other, the stylesheet, the script and the photos with
  **root-absolute** paths (`/menu.html`, `/design-tokens.css`, `/assets/img/...`).
  Opening a page as `file://` therefore loses the stylesheet and every image —
  to view the site locally, serve the folder:
  `python -m http.server 8123 --bind 127.0.0.1` and open `http://127.0.0.1:8123/`.
- `check_in_browser` / `interact_in_browser` are not available in this client
  ("browser checks are not available in this client yet"). Verify headlessly
  instead — see the tests below.

## Photos

- 21 JPEGs in `assets/img/`, all downloaded from Wikimedia Commons at 1280px
  and served locally (no hotlinking, no external image host). Licences are
  CC0 / CC BY / CC BY-SA, all listed in `credits.html`.
- Wikimedia no longer serves arbitrary thumbnail widths — requesting a custom
  width returns HTTP 400 "Use thumbnail sizes listed on…". Fetch the URL from
  the API with `iiurlwidth` and it snaps to a supported width.
- Swapping in real photography is a drop-in: keep the filename and path.

## Basket and ordering

- `site.js` holds the only product catalog (`CATALOG`, 18 slugs). A product
  exists only if there is both a `CATALOG` entry **and** a `data-add="slug"`
  button on a page — the integrity check compares the two sets.
- Basket persists in `localStorage` under `shirya.basket` (slug → qty); placed
  orders append to `shirya.orders`. All restored values pass through
  `sanitise()`, so hand-edited storage cannot inject unknown slugs or bad qty.
- Pickup rules: closed Mondays; Tue–Fri 07:00–19:00, Sat/Sun 07:00–16:00;
  half-hour slots; same-day bookings need an hour's notice. The date picker
  defaults to `firstOpenDate()` rather than "today", so it never opens on a
  Monday or after closing. No card is taken — it is pay-at-the-counter.

## Tests

Both suites run in Node against the real files, no browser needed.

- `node test-logic.js` — pricing, basket sanitising, opening hours, slot
  generation. Needs nothing installed.
- `node test-dom.js` — loads the real pages in jsdom, runs `site.js`, then
  drives the basket and a full checkout. Needs `npm i jsdom --no-save
  --no-package-lock` (node_modules is not committed).
- `site.js` exports its pure helpers on `window.Shirya` and via
  `module.exports` (and returns early when `document` is undefined) precisely
  so the logic can be tested outside a browser. Keep that seam if editing it.
