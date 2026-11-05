// The little noises Coot the Wire makes, and the recordings it plays.
//
// The noises are files in games/coot-the-wire/assets/: buzz.mp3 for a wrong peck,
// cut.mp3 for a right one, boom.mp3 when the last heart goes and defused.mp3 when the
// bomb is safe. A missing one just doesn't make a sound.

export const SOUNDS = ["buzz", "cut", "boom", "defused"];

/**
 * Sounds that play out of `folder` (a URL to assets/).
 * Returns { preload(url), speak(url), hush(), warm(), play(name) }. Everything fails quietly: a browser with no
 * Web Audio, or one that won't make a sound yet, just doesn't make one.
 */
export function createSfx(folder) {
  let context = null;
  const effects = new Map(); // name -> Promise<AudioBuffer | null>
  const voices = new Map(); // url -> Promise<AudioBuffer>
  let speaking = null;

  // Browsers only allow sound after the player has touched something, so this is
  // called from the button handlers rather than when the game loads.
  function open() {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      if (!context) context = new Ctor();
      if (context.state === "suspended") context.resume();
      return context;
    } catch {
      return null;
    }
  }

  // The effects' bytes start downloading as soon as the game loads, so the first peck
  // doesn't wait on the network. Decoding needs the audio context, which a browser
  // only allows after a tap, so that waits for effect().
  const downloads = new Map(
    SOUNDS.map((name) => [
      name,
      fetch(new URL(`${name}.mp3`, folder))
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null),
    ]),
  );

  // Decode a sound effect, once. Resolves to null if it's missing or won't decode, and
  // the answer is remembered, so a missing file is looked for once.
  function effect(name) {
    if (!effects.has(name)) {
      effects.set(
        name,
        (downloads.get(name) ?? Promise.resolve(null))
          .then((bytes) => (bytes && open() ? context.decodeAudioData(bytes) : null))
          .catch(() => null),
      );
    }
    return effects.get(name);
  }

  /** Stop whatever is being said. */
  function hush() {
    try {
      speaking?.stop();
    } catch {
      // Already finished; nothing to stop.
    }
    speaking = null;
  }

  /** Fetch a recording and decode it, once. */
  function voice(url) {
    if (!voices.has(url)) {
      voices.set(
        url,
        fetch(url).then(async (response) => {
          if (!response.ok) throw new Error(`no recording at ${url}`);
          const ctx = open();
          if (!ctx) throw new Error("no audio in this browser");
          return ctx.decodeAudioData(await response.arrayBuffer());
        }),
      );
    }
    return voices.get(url);
  }

  /** Give up on a recording that never arrives, so the player gets told something. */
  function within(seconds, promise) {
    return Promise.race([
      promise,
      new Promise((_, fail) => setTimeout(() => fail(new Error("took too long")), seconds * 1000)),
    ]);
  }

  return {
    /** Start fetching a recording so pressing Listen plays it straight away. */
    preload(url) {
      voice(url).catch(() => {}); // A missing one is reported when it's asked for.
    },

    /**
     * Play a recording through this same context, cutting off whatever was already
     * talking. Recordings go through here rather than an <audio> element because a
     * browser only unlocks one way of making sound per tap, and the sound effects
     * have already claimed the context — an element asked to play in the same breath
     * gets refused. Rejects if the recording is missing or won't decode.
     */
    async speak(url) {
      const buffer = await within(20, voice(url));
      const ctx = open();
      if (!ctx) throw new Error("no audio in this browser");
      hush();
      speaking = ctx.createBufferSource();
      speaking.buffer = buffer;
      speaking.connect(ctx.destination);
      speaking.start();
    },

    hush,

    /** Get the audio going while the player is definitely touching the screen. */
    warm() {
      open();
      for (const name of SOUNDS) effect(name).catch(() => {});
    },

    play(name) {
      const ctx = open();
      if (!ctx) return;
      effect(name)
        .then((buffer) => {
          if (!buffer) return;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start();
        })
        .catch(() => {});
    },
  };
}

