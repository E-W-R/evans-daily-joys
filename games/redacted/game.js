// Redacted: guess the Wikipedia article from its opening paragraphs, with most of the
// words blanked out. Five articles a week, four guesses each.
//
// Articles live in articles/weekN.txt (the format is described in article.js).
// Title suggestions come from titles/ (see suggest.js).

import { WEEKDAYS, weekdayOf } from "../../js/dates.js";
import { escapeHtml, shareText, toast } from "../../js/ui.js";
import { isCorrectGuess, normalize, parseWeek } from "./article.js";
import { suggestTitles } from "./suggest.js";

// The text is cut into chunks of 4 (words, [Article Title] and [Omitted] alike). Guess 1
// shows the first word of every chunk, guess 2 the first two, guess 3 three, and guess 4
// all of them. A wrong guess or a skip moves on to the next guess.
const CHUNK = 4;
const GUESSES = 4;
const SHOWING = ["1 in 4 words", "2 in 4 words", "3 in 4 words", "all words"]; // per guess
const POINTS = [4, 3, 2, 1]; // for getting it on guess 1, 2, 3, 4
const EMOJI = ["🟩", "🟨", "🟧", "🟥"]; // same, for sharing
const MISSED_EMOJI = "⬛";

export const howToPlay = `
  <h2>How to play</h2>
  <p>Guess the Wikipedia article from its opening paragraphs, with most of the words
    blanked out. There are 5 articles each week.</p>
  <ul>
    <li>You get 4 guesses per article. The text comes in chunks of 4 words, and at first
      you see just the first word of each. Every wrong guess (or skip) shows one more word
      per chunk, until for your last guess you can read the whole thing.</li>
    <li><span class="rd-tag rd-tag--title">[Article Title]</span> is where the article's
      name appears. <span class="rd-tag">[Omitted]</span> hides words that would give it
      away.</li>
    <li>Type 3 letters to see matching Wikipedia articles, most popular first.</li>
  </ul>
  <h3>Scoring</h3>
  <p>An article is worth 4 points on your first guess, 3 on your second, 2 on your third
    and 1 on your fourth. Your week's score is out of 100%.</p>
`;

export async function mount(root, ctx) {
  const response = await fetch(new URL(`./articles/week${ctx.puzzleNumber}.txt`, import.meta.url));
  const articles = response.ok ? parseWeek(await response.text()) : [];
  if (articles.length === 0) {
    root.innerHTML = `
      <div class="message pixel-box">
        <h2 class="message__heading">No articles yet</h2>
        <p class="message__text">This week's articles haven't been picked yet. Check back soon!</p>
      </div>`;
    return;
  }
  play(root, ctx, articles);
}

function play(root, ctx, articles) {
  // One result per article: every guess in order (null for a skip or giving up), and
  // whether the last one was right.
  const saved = ctx.saved?.results?.length === articles.length ? ctx.saved.results : null;
  const results = saved ?? articles.map(() => ({ guesses: [], solved: false }));

  const isFinished = (i) => results[i].solved || results[i].guesses.length >= GUESSES;
  const wrongGuesses = (i) => results[i].guesses.length - (results[i].solved ? 1 : 0);
  const allFinished = () => articles.every((_, i) => isFinished(i));
  // How many words of each chunk are showing.
  const shownPerChunk = (i) => (isFinished(i) ? CHUNK : wrongGuesses(i) + 1);
  const firstUnfinished = () => articles.findIndex((_, i) => !isFinished(i));

  let current = allFinished() ? articles.length - 1 : firstUnfinished(); // article on screen
  let showingSummary = allFinished();

  root.innerHTML = `
    <ol class="rd-progress" aria-label="Articles"></ol>
    <article class="rd-article pixel-box" aria-label="Article text" tabindex="0"></article>
    <div class="rd-bottom"></div>
    <p class="sr-only" aria-live="polite"></p>`;
  const progress = root.querySelector(".rd-progress");
  const text = root.querySelector(".rd-article");
  const bottom = root.querySelector(".rd-bottom");
  const announcer = root.querySelector("[aria-live]");

  // The suggestion list closes when the player taps anywhere outside the guess box, and
  // resizes when the phone keyboard opens or closes. setUpForm() fills these in.
  let closeSuggestions = () => {};
  let fitSuggestions = () => {};
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.(".rd-form")) closeSuggestions();
  });
  window.visualViewport?.addEventListener("resize", () => fitSuggestions());

  // After the whole week is done, the numbered squares switch between articles.
  progress.addEventListener("click", (event) => {
    const step = event.target.closest("[data-i]");
    if (!step || !showingSummary) return;
    current = Number(step.dataset.i);
    drawArticle();
    drawProgress();
    drawBottom();
  });

  // ---------- Drawing ----------
  function drawProgress() {
    progress.innerHTML = articles.map((_, i) => {
      const result = results[i];
      let state = "upcoming";
      if (result.solved) state = `got-${result.guesses.length}`;
      else if (isFinished(i)) state = "missed";
      const here = i === current ? " is-current" : "";
      return `
        <li><button class="rd-step rd-step--${state}${here}" type="button" data-i="${i}"
          ${showingSummary ? "" : "disabled"} aria-label="Article ${i + 1}"
          ${i === current ? 'aria-current="step"' : ""}>${i + 1}</button></li>`;
    }).join("");
  }

  // The words are all in the page from the start, hidden ones just invisible, so the
  // text never moves as blanks fill in.
  function drawArticle() {
    const shown = shownPerChunk(current);
    text.innerHTML = articles[current].paragraphs.map((pieces) => `<p>${pieces.map((piece) => {
      if (piece.kind === "text") return escapeHtml(piece.text);
      if (piece.kind === "title") return `<span class="rd-tag rd-tag--title">[Article Title]</span>`;
      if (piece.kind === "omit") return `<span class="rd-tag">[Omitted]</span>`;
      const hidden = piece.n % CHUNK >= shown ? " is-hidden" : "";
      return `<span class="rd-word${hidden}" data-n="${piece.n}"><span>${escapeHtml(piece.text)}</span></span>`;
    }).join("")}</p>`).join("");
    text.scrollTop = 0;
  }

  // Uncovers more words in place, with a flash so the new ones stand out.
  function revealWords(shown) {
    for (const word of text.querySelectorAll(".rd-word.is-hidden")) {
      if (word.dataset.n % CHUNK < shown) {
        word.classList.remove("is-hidden");
        word.classList.add("is-new");
      }
    }
  }

  function drawBottom() {
    if (showingSummary) drawSummary();
    else if (isFinished(current)) drawArticleResult();
    else drawGuessing();
  }

  function drawGuessing() {
    const result = results[current];
    const tries = result.guesses.length;
    bottom.innerHTML = `
      <div class="rd-status">
        <span class="rd-pips" aria-hidden="true">
          ${Array.from({ length: GUESSES }, (_, i) => `<span class="rd-pip${i < tries ? " is-used" : ""}"></span>`).join("")}
        </span>
        <span class="rd-status__text">Guess ${tries + 1} of ${GUESSES} · ${SHOWING[tries]}</span>
        <button class="rd-skip" type="button">${tries === GUESSES - 1 ? "Give up" : "Skip"}</button>
      </div>
      ${tries ? `<ul class="rd-tries" aria-label="Wrong guesses">${result.guesses.map((guess) =>
        guess === null
          ? `<li class="rd-try rd-try--skip">Skipped</li>`
          : `<li class="rd-try">${escapeHtml(guess)}</li>`).join("")}</ul>` : ""}
      <form class="rd-form" autocomplete="off">
        <ul class="rd-suggest pixel-box" id="rd-suggest" role="listbox" hidden></ul>
        <input class="rd-input" type="text" name="guess" placeholder="Name the article"
          aria-label="Your guess" role="combobox" aria-autocomplete="list"
          aria-controls="rd-suggest" aria-expanded="false" enterkeyhint="go"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <button class="pixel-btn rd-go" type="submit">Guess</button>
      </form>`;
    bottom.querySelector(".rd-skip").addEventListener("click", () => submitGuess(null));
    setUpForm(bottom.querySelector(".rd-form"));
  }

  function drawArticleResult() {
    const result = results[current];
    const article = articles[current];
    const last = current === articles.length - 1;
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replaceAll(" ", "_"))}`;
    bottom.innerHTML = `
      <div class="rd-result pixel-box">
        <p class="rd-result__verdict">
          ${result.solved
            ? `Got it on guess ${result.guesses.length}!`
            : result.guesses.at(-1) === null ? "You gave up. It was:" : "Out of guesses. It was:"}
        </p>
        <h2 class="rd-result__title">${escapeHtml(article.title)}</h2>
        <a class="rd-result__link" href="${url}" target="_blank" rel="noopener">Read it on Wikipedia</a>
        <button class="pixel-btn" type="button">${last ? "See results" : "Next article"}</button>
      </div>`;
    bottom.querySelector("button").addEventListener("click", () => {
      if (last) {
        showingSummary = true;
      } else {
        current += 1;
        drawArticle();
      }
      drawProgress();
      drawBottom();
    });
  }

  function drawSummary() {
    const found = results.filter((result) => result.solved).length;
    const result = results[current];
    const title = articles[current].title;
    bottom.innerHTML = `
      <div class="rd-result pixel-box">
        <h2 class="rd-result__score">${percent()}%</h2>
        <p>You found ${found} of ${articles.length} articles.</p>
        <p class="rd-result__viewing">
          ${current + 1}. ${escapeHtml(title)} ·
          ${result.solved ? `guess ${result.guesses.length}` : "missed"}
        </p>
        ${ctx.isToday ? `<p class="rd-result__next">New articles next ${WEEKDAYS[weekdayOf(ctx.date)]}.</p>` : ""}
        <button class="pixel-btn" type="button">Share</button>
      </div>`;
    bottom.querySelector("button").addEventListener("click", () => {
      shareText([
        `${ctx.game.name} #${ctx.puzzleNumber}`,
        results.map((r) => (r.solved ? EMOJI[r.guesses.length - 1] : MISSED_EMOJI)).join(""),
        `${percent()}%`,
        new URL("./", location.href).href,
      ].join("\n"));
    });
  }

  // Points out of the most possible (4 per article), as a percentage.
  const percent = () => {
    const points = results.reduce((total, r) => total + (r.solved ? POINTS[r.guesses.length - 1] : 0), 0);
    return Math.round((100 * points) / (articles.length * POINTS[0]));
  };

  // ---------- Guessing ----------
  function submitGuess(guess) {
    const result = results[current];
    if (guess !== null && result.guesses.some((g) => g && normalize(g) === normalize(guess))) {
      toast("You already guessed that");
      return;
    }
    result.guesses.push(guess);
    if (guess !== null && isCorrectGuess(guess, articles[current])) result.solved = true;
    ctx.save({ results, done: allFinished() });
    document.activeElement?.blur(); // Put the phone keyboard away so the new words show.

    if (isFinished(current)) {
      revealWords(CHUNK);
      announcer.textContent = result.solved ? "Correct!" : `Out of guesses. It was ${articles[current].title}.`;
    } else {
      revealWords(shownPerChunk(current));
      announcer.textContent = guess === null ? "Skipped. More words shown." : "Not quite. More words shown.";
    }
    drawProgress();
    drawBottom();
    if (!result.solved && guess !== null) {
      const status = bottom.querySelector(".rd-status, .rd-result");
      status?.classList.add("is-wrong"); // a little shake
    }
  }

  // The guess box, with suggestions that pop up above it once 3 letters are typed.
  function setUpForm(form) {
    const input = form.querySelector("input");
    const list = form.querySelector(".rd-suggest");
    let options = [];
    let active = -1;
    let latest = 0; // ignore answers to older lookups that arrive late
    let timer;

    const close = () => {
      list.hidden = true;
      options = [];
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    };

    const open = (titles) => {
      options = titles;
      active = -1;
      list.innerHTML = titles
        .map((title, i) => `<li id="rd-option-${i}" role="option" data-i="${i}">${escapeHtml(title)}</li>`)
        .join("");
      list.hidden = titles.length === 0;
      list.scrollTop = 0;
      input.setAttribute("aria-expanded", String(titles.length > 0));
      fitList();
    };

    // The list scrolls, and is never taller than the room above the box that's actually
    // on screen (the phone keyboard can cover the bottom half).
    const fitList = () => {
      if (list.hidden) return;
      const screenTop = window.visualViewport?.offsetTop ?? 0;
      const room = form.getBoundingClientRect().top - screenTop - 24;
      list.style.setProperty("--room", `${Math.max(120, Math.floor(room))}px`);
    };

    const highlight = (i) => {
      active = i;
      list.querySelectorAll("li").forEach((li, j) => li.classList.toggle("is-active", j === i));
      list.children[i].scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", `rd-option-${i}`);
    };

    const choose = (i) => {
      input.value = options[i];
      close();
      input.focus();
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      const typed = input.value;
      if (normalize(typed).length < 3) close();
      timer = setTimeout(async () => {
        const lookup = ++latest;
        const titles = await suggestTitles(typed);
        if (lookup === latest && input.value === typed && document.activeElement === input) open(titles);
      }, 80);
    });

    input.addEventListener("keydown", (event) => {
      if (list.hidden) return;
      if (event.key === "ArrowDown") highlight((active + 1) % options.length);
      else if (event.key === "ArrowUp") highlight(active <= 0 ? options.length - 1 : active - 1);
      else if (event.key === "Enter" && active >= 0) choose(active);
      else if (event.key === "Escape") close();
      else return;
      event.preventDefault();
    });

    closeSuggestions = close;
    fitSuggestions = fitList;
    list.addEventListener("mousedown", (event) => event.preventDefault()); // keep focus
    list.addEventListener("click", (event) => {
      const option = event.target.closest("[data-i]");
      if (option) choose(Number(option.dataset.i));
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const guess = input.value.trim();
      if (!guess) return input.focus();
      close();
      submitGuess(guess);
    });
  }

  drawProgress();
  drawArticle();
  drawBottom();
}

