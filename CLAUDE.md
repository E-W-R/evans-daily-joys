# Evan's Daily Joys

A daily-games site with 7 games, one per weekday, hosted on GitHub Pages (EvansDailyJoys.com
later). README.md covers the file layout, adding games, and deploying.

## Conventions

- Plain static site: vanilla HTML, CSS and ES modules. No build step, npm or frameworks.
  Node isn't installed. Preview with `python3 -m http.server`.
- Design for mobile first. Check at 390×844 and 375×667. On desktop the app is a centered
  column capped at 480px. Content spans 90% of the screen width (5% gutters).
- Keep every URL relative, with no leading `/`. Until the custom domain is live, the site
  is served from `/<repo>/`.
- Pixel look: Pixelify Sans (self-hosted), color tokens in `:root` in `css/base.css`,
  borders from `.pixel-box`/`.pixel-btn` (hard box-shadows in multiples of `--px`), and
  pixel art from `pixelArt()` in `js/icons.js`. No blur and no rounded corners. The one
  exception Evan asked for: Coot the Wire's green/red halo around the bomb after a peck.
- Pixelify Sans's C/O, Z/2 and S/5 look alike, so letters players must read at a glance
  (clues, answer boxes, keyboard keys) use `var(--font-readable)` (Atkinson Hyperlegible
  Next, self-hosted). Everything else stays pixel.
- Dates are `YYYY-MM-DD` keys handled by `js/dates.js`. Never call
  `new Date("YYYY-MM-DD")`, because it parses as UTC. "Today" is the player's local date.
- Each game lives in `games/<id>/`:
  - `game.js` exports `mount(root, ctx)`, and optionally `howToPlay` (an HTML string the
    shell shows from the "?" button and on a player's first visit)
  - `game.css` is scoped under `.game-<id>`, which is also on the help dialog
  - the puzzle file is keyed `week<N>`

  Register games by weekday in `js/games.js`. Sunday is Minute CryptEvan
  (`games/minute-cryptevan/`). Monday is Redacted (`games/redacted/`): a week is 5 articles
  in `articles/weekN.txt`. Tuesday is Coot the Wire (`games/coot-the-wire/`): a week is a
  folder `assets/weekN/` where Evan drops one sprite sheet, `bomb.png`, and
  `tools/build_coot_the_wire.py` cuts it into `bomb-N.gif`, `hitbox-N.png` and `bomb.json`
  (never edit those by hand), then does the recordings, so one command builds a week.
  The number of rounds varies by week; read it from
  `bomb.json`. Recordings are `recN.mp3` (not `.m4a`: servers
  mislabel it and browsers refuse it), written by that same script from Evan's
  clean takes in `assets/weekN/voice/`, which it never touches; it band-limits them to
  300-3000Hz and adds squelch, and needs `lame` for the mp3 (macOS reads mp3 but can't
  write it). Hit testing is pixel-exact and lives in
  `masks.js` (never name a script `hitbox.js`: Safari's privacy blocklist blocks
  that filename, after an old analytics product, and the game won't load); a hitbox PNG's opaque pixels are the hitbox, and it doubles as the
  artwork's size. The sound effects are Evan's files `assets/buzz.mp3`, `cut.mp3`,
  `boom.mp3` and `defused.mp3`, played by `sfx.js`. Its arena bleeds past the page gutters to the screen
  edges so the bomb can sit wider than the buttons.
  Wednesday is Odd One Out (`games/odd-one-out/`): a week is three rounds of a
  Vancouver chain's branches in `odd_one_out.json`, each written `[lat, lon]`, one
  of them a `decoy` that doesn't exist. Evan writes those pins by hand, so there's
  nothing to build for a week and nothing to geocode. `tools/build_odd_one_out.py`
  only rebuilds `map/land.png` + `map/roads.json` (one Metro Vancouver map shared
  by every week) from OpenStreetMap; never edit those two by hand, and keep every
  pin inside the box at the top of that script. `map.js` draws the crop onto a canvas of
  ~2px blocks and hardens every pixel to the palette, because canvas smooths
  diagonals and this site has no blur. Street names ride above the canvas as DOM
  text in `--font-readable`. Its map bleeds to the screen edges like Coot's arena,
  and the OpenStreetMap credit under it is required by the data's licence.
  Thursday is True Colours (`games/true-colours/`): a week is seven rounds, each one
  of Sanzo Wada's palettes stacked with two made-up ones of the same size, one guess
  a round. `tools/build_true_colours.py` writes `true_colours.json` from
  mattdesl/dictionary-of-colour-combinations. It's seeded, and `--weeks N` adds weeks
  without changing earlier ones, so never edit the JSON by hand. The data is MIT: keep
  `LICENSE-colours.md` and the credit in the how-to-play.
  Friday is Date Guessr (`games/date-guessr/`): two photos of Evan and his girlfriend a
  week, guessing the day and the spot each was taken, from the photo's own metadata.
  The photos are personal and this site is public, so `games/date-guessr/locked/` holds
  them encrypted and she types a keyphrase once to open them. `tools/build_date_guessr.py`
  writes that folder from the originals in `games/date-guessr/images/`; never edit it by
  hand. The originals are git-ignored and must never be committed, in any folder, and the
  keyphrase must never be written into a file: the script asks for it. `tidy()` exists in
  that script and in `games/date-guessr/locked.js`, and the two copies must stay
  identical. Its pop-up map is Leaflet (vendored in `assets/leaflet/`) over OpenStreetMap
  tiles, loaded only when the map opens: the one part of the site that isn't pixel art,
  because the guess is scored to the metre. Keep the tiles' credit line.
- `games/redacted/titles/` is generated by `tools/build_redacted_titles.py`, so never edit
  it by hand. `normalize()` exists in both that script and `games/redacted/article.js`,
  and the two copies must stay identical.
- The play page is exactly 100dvh tall. Keep controls like the keyboard on screen and
  scroll only the part above them (see `.mc-top` in Minute CryptEvan).
- Reuse the shared pieces: `js/keyboard.js`, `toast()`/`shareText()`/`confirmDialog()` in
  `js/ui.js`, and `.pixel-box`/`.pixel-btn`.
- `LOCK_FUTURE_DAYS` in `js/config.js` is on (launch is Nov 8, 2026). Days before launch
  are always locked. `OPEN_EARLY_THROUGH` opens the launch week (through Nov 14) early.
- Save progress only through `js/storage.js`. Keys look like `edj:v1:<gameId>:<date>`, and
  `done: true` shows the calendar check mark. Wrap all storage access in try/catch,
  because the site must work without it.
