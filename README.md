# Evan's Daily Joys

A daily-games website, like Wordle, with seven games: one for each day of the week.
It's built for phones first. It's a plain static site (HTML, CSS and JavaScript with no
build step), so GitHub Pages can host it for free.

## Run it locally

Browsers won't load the site's JavaScript from a `file://` address, so serve the folder:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To see it at phone size, open Chrome DevTools and
click the device toolbar button.

To try it on your actual phone, connect the phone to the same Wi-Fi and open
`http://<your-computer's-IP>:8000`. On a Mac, `ipconfig getifaddr en0` prints the IP.

### Testing helpers

- `LOCK_FUTURE_DAYS` in `js/config.js` is **on**, so days after today are locked. Set it
  to `false` to open future days and browse future months while building. Days before
  launch are always locked. `OPEN_EARLY_THROUGH` opens the launch week (Nov 8–14) early.
- Add `?today=2026-10-03` to any page to pretend it's that date. It lasts for the rest of
  the browser tab, and a badge in the corner shows it's on. Tap the badge to switch back.
- `play.html?game=<folder>&date=YYYY-MM-DD` loads `games/<folder>/` for that date, even
  before the game is marked ready. Try `play.html?game=template&date=2026-11-08`.
- Each game's progress is saved in the browser. To replay puzzles from scratch, tap
  **Reset progress** under the Play button. It only appears while `LOCK_FUTURE_DAYS` is
  off, so it disappears at launch.

## How it's organized

| Path | What it is |
|---|---|
| `index.html` | Home page: title, calendar, Play button |
| `play.html` | Game page. `play.html?date=YYYY-MM-DD` plays that day's puzzle; no date means today |
| `css/base.css` | Colors, font, and the shared pixel box and button. Change the colors here |
| `css/home.css`, `css/play.css` | Styles for each page |
| `js/config.js` | Launch date, the first day of the week, and the date locks |
| `js/games.js` | The seven games in weekday order: names, colors, icons. Saturday has no game, so its squares stay empty |
| `js/dates.js` | Date helpers: today, puzzle numbers, formatting |
| `js/calendar.js` | The calendar |
| `js/icons.js` | Draws pixel art from text (arrows, check mark, …) |
| `js/storage.js` | Saves each player's progress in their browser |
| `js/keyboard.js` | The on-screen pixel keyboard, for games where you type letters |
| `js/ui.js` | Shared helpers: pop-up messages (toasts), "Are you sure?" boxes, sharing results |
| `games/minute-cryptevan/` | Sunday's game, Minute CryptEvan |
| `games/redacted/` | Monday's game, Redacted |
| `games/coot-the-wire/` | Tuesday's game, Coot the Wire |
| `games/odd-one-out/` | Wednesday's game, Odd One Out |
| `games/true-colours/` | Thursday's game, True Colours |
| `games/date-guessr/` | Friday's game, Date Guessr. `images/` holds your photos and is never committed; `locked/` holds the encrypted copies that are |
| `tools/build_redacted_titles.py` | Rebuilds Redacted's Wikipedia title suggestions |
| `tools/build_coot_the_wire.py` | Builds a Coot the Wire week: cuts the bomb, then puts the recordings through a walkie-talkie |
| `tools/build_odd_one_out.py` | Rebuilds Odd One Out's Metro Vancouver map |
| `tools/build_true_colours.py` | Deals out True Colours' palettes, a year at a time |
| `tools/build_date_guessr.py` | Crops, shrinks and encrypts Date Guessr's photos |
| `games/template/` | Starter game to copy |
| `assets/leaflet/` | Leaflet, the map library Date Guessr uses (BSD licence, kept with it) |
| `assets/` | The fonts and site icons. Pixelify Sans is the pixel font; Atkinson Hyperlegible Next is for clues, answers and keyboard keys. Both use the OFL license |

## How puzzles are scheduled

Each game gets a new puzzle every week. Puzzle numbers count weeks from `LAUNCH_DATE` in
`js/config.js` (Sunday, November 8, 2026): the launch week is #1, the week after is #2,
and so on. A game's puzzle file uses the keys `week1`, `week2`, and so on.

"Today" is the player's local date, so the puzzles change at each player's own midnight.
Days before launch are greyed out and can't be opened. With `LOCK_FUTURE_DAYS` on, days
after today are locked too, except those up to `OPEN_EARLY_THROUGH`.

Progress is saved in each player's browser, so switching devices starts fresh. When a
game saves `done: true` for a day, the calendar shows a check mark on that day.

## Writing Minute CryptEvan clues

Add each week's clue to `games/minute-cryptevan/minutecryptevan.json` under the next
`weekN` key. Week 1 is the week of November 8, 2026.

```json
"week3": {
    "clue": "Heart broken on planet",
    "answer": "earth",
    "par": 1,
    "hints": {
        "indicator":  { "highlight": ["broken"], "text": "..." },
        "fodder":     { "highlight": ["Heart"],  "text": "..." },
        "definition": { "highlight": ["planet"], "text": "..." }
    }
}
```

- `answer`: spaces split words and hyphens are kept, so `self-made` shows as (4-4).
  Other punctuation is ignored.
- `highlight`: each entry has to appear in the clue as whole words, spelled the same way
  (capitals don't matter). If one doesn't match, it isn't highlighted and the browser
  console shows a warning.
- `par`: the number of hints a good solve should take. "par" appears under that circle.
- A clue can leave out a hint (a double definition has no fodder, for example). Its button
  then doesn't appear.

## Writing Redacted articles

Each week's five articles go in `games/redacted/articles/weekN.txt`. Week 1 is the week
of November 8, 2026, so `week1.txt` is played on Monday, November 9. Paste each article's
title on one line, then its paragraphs, one per line. Put a blank line between articles:

```
Pelican
Pelicans (genus Pelecanus) are a genus of large water birds ...
The eight living pelican species have a patchy ...

Beauty
Beauty is commonly described as ...
```

The game then works out the rest by itself:

- The title, and its plurals and possessives, become **[Article Title]**. Words that look
  a lot like the title (Pelecanus and Pelecanidae for Pelican) become **[Omitted]**.
- Anything the automatic check misses can be hidden by wrapping it in braces:
  `{Pelecaniformes}` becomes [Omitted].
- Footnote markers like `[2]` and `[citation needed]` are removed.
- Guesses ignore capitals, punctuation, plurals, a one-letter typo, and a qualifier in
  brackets, so "Gemini (astrology)" counts for Gemini. To accept other answers too, add
  them after the title with `|`, e.g. `United States | USA | America`.

To check how an article comes out, play it on its date with `LOCK_FUTURE_DAYS` off, then
use **Reset progress** to play it again.

### Title suggestions

Once a player types 3 letters, Redacted suggests up to 20 Wikipedia articles starting with
those letters, most-viewed first, in a list that scrolls. The list covers English Wikipedia's million most-viewed
articles, which is everything with more than about 570 views a month. It lives in
`games/redacted/titles/`: about 2,400 small files, 22 MB in total, so a phone downloads
only a few KB per lookup. The view counts come from Wikipedia's monthly clickstream data,
currently August 2026.

To refresh the list with newer data (for new shows and the like), run:

```sh
python3 tools/build_redacted_titles.py
```

It downloads last month's data (about 500 MB, into `tools/.cache/`, which git ignores),
takes a minute or two, and rewrites `games/redacted/titles/`. Then commit the changes.

## Building a Coot the Wire bomb

Coot the Wire is Tuesday's game: you're a pigeon, there's a bomb, and a recording tells
you what to peck. A week can have any number of rounds — three hearts cover the lot.

You draw **one PNG** and record your lines in a week's folder, then build the whole
week with one command:

```sh
python3 tools/build_coot_the_wire.py 2      # cuts week 2's bomb.png, then does its recordings
```

### The sprite sheet

`games/coot-the-wire/assets/week<N>/bomb.png` is a single column of sprites, all the
same size, stacked top to bottom in threes:

| Row | What it is |
|---|---|
| 1 | bomb 1, frame a |
| 2 | bomb 1, frame b |
| 3 | hitbox 1 — peck here while bomb 1 is showing |
| 4 | bomb 2, frame a |
| 5 | bomb 2, frame b |
| 6 | hitbox 2 |
| … | … |
| last two | the defused bomb, both frames — no hitbox after it |

So n bombs means 2n bomb sprites and n − 1 hitboxes, 3n − 1 rows in all, and the game
gets n − 1 rounds. Week 1 is 53×55 sprites, 770px tall: 14 rows, 5 bombs, 4 rounds.

The two frames of a bomb are what the GIF alternates between, a second each — week 1
uses them to blink the colon on the timer. Draw each bomb picture with the previous
round's wire already cut, so the bomb visibly comes apart as the player works.

A **hitbox sprite** is the same size as the bomb with the pecking target painted in —
any solid colour, black is easiest — and every other pixel left see-through. A peck
counts when the pigeon's beak lands on a painted pixel, so paint generously. Week 1's
smallest is 2×2, which comes out about 12px across on a phone; that's about as mean as
it's worth being.

### Cutting it up

`build_coot_the_wire.py` does this before the recordings. It writes `bomb-1.gif …`, `hitbox-1.png …` and `bomb.json` next to `bomb.png`, clears
out anything from a previous run, and prints what it found:

```
week1: 53x55 sprites, 5 bombs and 4 hitboxes → 4 rounds
```

If the sheet doesn't divide evenly it says so and leaves the bomb files alone. Sprites other than
55px tall need `--sprite-height`. Commit `bomb.png` along with what the script makes.

### The recordings

One per round, `rec1.mp3`, `rec2.mp3`, … in the same folder. The **Listen** button
plays the current round's, as often as the player likes. They must be `.mp3`: servers
disagree about what to call an `.m4a` and a browser won't play one it doesn't
recognise, while `.mp3` is served as `audio/mpeg` everywhere.

#### Making them sound like a walkie-talkie

Put your clean takes in the week's `voice/` folder and let `tools/build_coot_the_wire.py`
make the files the game plays. Name them `rec1`, `rec2`, … to match the rounds; the
extension doesn't matter, only that `voice/` is where they live:

```
games/coot-the-wire/assets/week1/
    voice/          <- your clean takes. The script never writes here.
        rec1.mp3        mp3, m4a, wav, aiff, caf — whatever you have.
        rec2.mp3        Mixing formats in one folder is fine too.
    rec1.mp3        <- what the script writes, and what the game plays
    rec2.mp3
```

```sh
brew install lame                   # once; macOS can read mp3 but not write it
python3 tools/build_coot_the_wire.py 1      # just week 1
python3 tools/build_coot_the_wire.py        # every week with a bomb.png or a voice/ folder
```

It cuts the week's `bomb.png` first (see above), so it can tell you if a round has no
recording.

It trims the silence off both ends, evens out the loud and quiet parts, throws away
everything outside 300–3000 Hz, pushes it into a gentle overdrive, lays hiss
underneath, and keys the handset on and off around it — a burst of static at the top,
a click and a tail of hiss at the end. About 0.4s gets added to each clip.

Your takes in `voice/` are never touched, so you can re-run it as often as you like
with different settings. `--drive` and `--hiss` are the two worth playing with;
`--squelch 0` drops the static burst and click; `--help` lists the rest. It warns if
the week has more rounds than takes, and if a `rec<N>.mp3` has no take behind it.

`transcript.txt` is optional: one line per round, saying what each recording says.
While a `rec<N>.mp3` is missing the game shows that line on screen instead, so a week
can be played before it's been recorded, and it's shown again if a player asks to be
shown the answer.

### The noises

Four files in `games/coot-the-wire/assets/`, shared by every week and played by
`sfx.js`. To change one, replace the file:

| File | When it plays |
|---|---|
| `buzz.mp3` | a peck that missed |
| `cut.mp3` | a peck that cut a wire |
| `boom.mp3` | the third heart gone |
| `defused.mp3` | every wire cut |

A missing one just plays nothing.

### The pigeon

Shared by every week, one folder up: `assets/Pidge.png` is what players see and
`assets/Pidge-Hitbox.png` is its beak, painted the same way as a bomb hitbox.

### Checking a week

Play it at `play.html?game=coot-the-wire&date=2026-11-10` (add 7 days per week), then
use **Reset progress** on the home page to play it again. A week with no `bomb.json`
says so rather than breaking.

Nothing on screen counts the rounds — the player works through them until the bomb is
defused — so a week can be as long or short as the sheet you drew.

## Writing an Odd One Out week

Wednesday's game shows three Vancouver chains, one round each. Every branch of the chain
is a pin on a square of map — except one pin, which is a branch that doesn't exist.
Players tap the pin they think is made up and press **Guess**; a wrong guess greys that
pin out and they keep going. The score is how many guesses the three rounds take
altogether, so 3 is perfect.

A week is three rounds in `games/odd-one-out/odd_one_out.json`, and every branch is the
spot it sits on, written `[latitude, longitude]`:

```json
{
  "week1": {
    "round1": {
      "name": "Ramen DANBO",
      "decoy": [49.237142, -123.048279],
      "real": [
        [49.268229, -123.146399],
        [49.287455, -123.128933]
      ]
    },
    "round2": { "...": "..." },
    "round3": { "...": "..." }
  }
}
```

- `name` is the chain, shown above the map.
- `decoy` is the branch that was never there. Put it somewhere the chain plausibly
  *would* be — a busy corner in a neighbourhood it hasn't reached. The game shuffles it
  in among the real ones, so it's never the same pin twice.
- `real` is every other branch. Four to six makes a good round; the map crops itself to
  fit however many there are, so a round that stays in Vancouver zooms in and one that
  reaches Coquitlam zooms out.

To get a pin, right-click the spot in Google Maps and click the latitude and longitude
at the top of the menu — that copies them in exactly this order. Anywhere between
Tsawwassen and Coquitlam is on the map; further out and the pin lands on nothing (see
**The map** below).

That's the whole of it — nothing to build, and nothing else in the game to touch. Check
the week at `play.html?game=odd-one-out&date=2026-11-11` (add 7 days per week), then use
**Reset progress** on the home page to play it again. A week with no rounds written says
so rather than breaking.

### The map

`games/odd-one-out/map/` is one map of Metro Vancouver that every week and every round
shares: `land.png` is the shape of the land and water, `roads.json` is every main street
with its name. It's drawn onto a canvas at play time, so a round's square comes out as
pixels at whatever size the phone gives it, and no map service is called while anyone is
playing.

It's built from OpenStreetMap and only needs rebuilding if the streets go out of date —
once a year at the outside:

```sh
python3 tools/build_odd_one_out.py
```

That downloads about 30 MB and takes a few minutes. The area it covers is `SOUTH, WEST,
NORTH, EAST` at the top of `tools/build_odd_one_out.py`; widen it and rebuild if a week
ever reaches past it. The colours the map is drawn in are at the top of
`games/odd-one-out/game.css`. Map data is © OpenStreetMap contributors, credited under
the map in the game.

## True Colours

Thursday's game has seven rounds. Each round stacks three palettes: one from Sanzo Wada's
*A Dictionary of Colour Combinations*, and two made up from the book's own colours with
the same number of colours as the real one. Players tap the one they think is real and
press **Guess**. They get one guess a round, so the score is out of 7. Right or wrong, the
real palette gets a tick and its colours are named.

Nothing is written by hand. `tools/build_true_colours.py` wrote 52 weeks (November 12,
2026 to November 4, 2027) into `games/true-colours/true_colours.json`:

- The book's 348 palettes are shuffled and dealt out seven a week. 52 weeks is 364
  rounds, so 16 palettes come round a second time near the end, each at least 25 weeks
  after its first showing.
- A made-up palette is colours picked at random from the book's 159, and is never one of
  the book's own palettes.
- The order of the three palettes is random, and so is the order of the colours in each.
  The data doesn't record the order the book prints a palette's colours in, so the real
  one is shuffled too. Otherwise the real palette would give itself away by always
  being in the data's tidy order.

It's all seeded, so every player gets the same rounds and rerunning the script writes the
same file. When the year runs out:

```sh
python3 tools/build_true_colours.py --weeks 104
```

That leaves weeks 1–52 exactly as they are and adds weeks 53–104. Don't edit the JSON by
hand, because the next run would undo it. Check a week at
`play.html?game=true-colours&date=2026-11-12` (add 7 days per week).

The colours come from Matt DesLauriers's
[dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations),
downloaded into `tools/.cache/` at a fixed version. Its MIT licence asks for the
copyright notice to travel with the data, so it's kept in
`games/true-colours/LICENSE-colours.md`, and the how-to-play credits it.

## Date Guessr

Friday's game shows two of your photos, one at a time. For each one she guesses the day
it was taken and the spot it was taken at, then presses **Submit**:

- The day is worth 100, less a point for every day she's out.
- The spot is worth 100, less a point for every 10 metres she's out. Within 10 m is full
  marks; a kilometre off is none.

Two photos at 200 each, so a Friday is out of 400. The real day and the real spot come
from the photo's own metadata, so there's nothing to write by hand.

### Adding photos

Put them in `games/date-guessr/images/`. That folder is in `.gitignore`, so the originals
stay on your computer: **never commit them**, and never move one out of that folder to
somewhere that is committed. Deleting a photo later wouldn't take it off GitHub, because
the repository keeps every version of everything.

A photo needs both a date and a location in its metadata. Ones straight off a phone have
both; screenshots, scans and some edited or exported copies have lost the location, and
the script lists any it had to leave out. Two photos make a week, so an odd one is held
back until there's another to go with it.

Then:

```sh
python3 tools/build_date_guessr.py        # needs: python3 -m pip install Pillow cryptography
```

It asks for the keyphrase (the first run sets it), and writes `games/date-guessr/locked/`:
each photo cropped to a square, shrunk to 1000 px, stripped of its metadata and encrypted,
plus one encrypted file holding every week's answers. That folder is the only part that
goes on GitHub.

Run it again whenever you add photos. Weeks that already exist keep the photos they have,
and new photos are shuffled onto the end, so a week she has already played never changes.
Re-running without adding anything rewrites nothing at all.

### The keyphrase

She types it once on her phone, and that phone remembers it afterwards. **Reset
progress** on the home page forgets it, and then she types it again.

The phrase is never written down anywhere in this repository, and nor is the key itself:
the script asks for it each run and keeps it in memory. Capitals, punctuation and extra
spaces don't matter: if the phrase were `blue hat red door`, then `Blue Hat, Red Door!`
would open the photos just the same.

Anyone can download the locked files, so the only thing standing between them and the
photos is how long the phrase would take to guess. The lock deliberately takes about half
a second to try one phrase. A few words is out of reach; a four-letter code would fall in
under an hour, and a date in seconds. The lock screen's nudge is `HINT` at the top of
`games/date-guessr/game.js` — keep it about the shape of the phrase, never the words.

To change the phrase, delete `games/date-guessr/locked/` and run the script again. Bear in
mind that copies locked with the old phrase stay in the repository's history, so this
protects new photos, not ones already pushed.

### The map

The pop-up map is [Leaflet](https://leafletjs.com) with OpenStreetMap tiles. Leaflet is
kept in `assets/leaflet/` and only loads when she opens the map; the tiles come down from
OpenStreetMap, which asks for the credit line in the map's corner, so leave it there.
It's the one part of the site that isn't pixel art, because a guess within a few metres
needs a real map.

### Checking a week

`play.html?game=date-guessr&date=2026-11-13` is week 1 (add 7 days per week). There are
51 weeks of photos, to November 2027.

## Adding a game

1. Copy `games/template/` to `games/<game-id>/`. Use lowercase and dashes, for example
   `wiki-abridged`.
2. Build the game in its `game.js`. The comment at the top explains what `mount()`
   receives and the optional `howToPlay` guide. Put its puzzles in `puzzles.json` and its
   styles in `game.css`, under `.game-<game-id>`.
3. Preview it at `play.html?game=<game-id>&date=2026-11-08`.
4. In `js/games.js`, fill in that weekday's `id`, `name` and `icon`, and set `ready: true`.

The game page is exactly one screen tall, so a game can pin things to the bottom the way
Minute CryptEvan pins its keyboard. Shared pieces to reuse: `createKeyboard()` in
`js/keyboard.js`, `shareText()` and `toast()` in `js/ui.js`, and the `.pixel-box` and
`.pixel-btn` styles in `css/base.css`.

### Icons

You can draw a calendar icon as text in `js/games.js`:

```js
import { pixelArt, INK } from "./icons.js";

icon: pixelArt(
  [
    ".####.",
    "#rrrr#",
    "#rrrr#",
    ".####.",
  ],
  { "#": INK, r: "#e4572e" },
),
```

You can also draw it in a pixel art app (Aseprite, Piskel, …), save it as a small PNG and
use the file path, for example `icon: "assets/icons/cryptic.png"`. The site scales icons up
and keeps the pixels crisp either way. The current icons are 16×16 pixels, cut from
`assets/Icons.png`.

## Publishing on GitHub Pages

1. Create a repository on GitHub and push this folder to its `main` branch.
2. In the repository, go to **Settings → Pages → Build and deployment**. Set Source to
   **Deploy from a branch**, the branch to **main**, and the folder to **/ (root)**.
3. After about a minute the site is live at `https://<username>.github.io/<repository>/`.

Every link in the site is relative, so it works at that address and later at the custom
domain.

### Connecting EvansDailyJoys.com (once it's bought)

1. At the domain registrar, add these DNS records:
   - four `A` records for `@`, pointing to `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153` and `185.199.111.153`
   - a `CNAME` record for `www`, pointing to `<username>.github.io`
2. In **Settings → Pages → Custom domain**, enter `evansdailyjoys.com` and save. GitHub
   commits a `CNAME` file to the repository, so pull it afterwards.
3. When the DNS check passes, tick **Enforce HTTPS**.
4. Recommended: in your GitHub account's **Settings → Pages**, verify the domain so no one
   else can point it at their own site.

Don't add a `CNAME` file before you own the domain. GitHub Pages would redirect the site
to an address that doesn't exist yet.
