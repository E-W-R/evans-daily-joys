// Date Guessr's photos are personal, and this site is public, so everything in
// locked/ is encrypted. This file is the key handling: turning the keyphrase into
// a key, checking it, remembering it, and opening the files with it.
//
// tools/build_date_guessr.py writes those files and explains the format. Each one
// is 12 bytes of nonce then AES-256-GCM ciphertext, and lock.json holds the salt,
// the iteration count and a test blob. Nothing here can tell a wrong keyphrase
// from a damaged file, and it doesn't need to: either the bytes come out or they
// don't.
//
// The key is kept on the player's own device once she's typed the phrase, so she
// only types it the once. Resetting progress on the home page forgets it.

import { loadSetting, saveSetting } from "../../js/storage.js";

const SETTING = "date-guessr-key";
const CHECK = "date-guessr"; // what lock.json's test blob says when it opens

const file = (name) => new URL(`./locked/${name}`, import.meta.url);
const toBytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

/**
 * A keyphrase as it's compared: lowercase words, nothing else. So capitals, stray
 * punctuation and double spaces don't matter.
 *
 * The same function lives in tools/build_date_guessr.py. Keep the two identical, or
 * a phrase that locks the photos won't open them.
 */
export const tidy = (phrase) =>
  (String(phrase).toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");

/** True if this browser can decrypt at all. Web Crypto needs https (or localhost). */
export const canUnlock = () => Boolean(globalThis.crypto?.subtle);

/** What locked/lock.json says: how to stretch the keyphrase, and how to check it. */
export async function lockInfo() {
  const response = await fetch(file("lock.json"));
  if (!response.ok) throw new Error(`lock.json: ${response.status}`);
  return response.json();
}

const importKey = (raw) =>
  crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["decrypt"]);

async function stretch(phrase, lock) {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(tidy(phrase)), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: toBytes(lock.salt),
    iterations: lock.iterations,
  }, material, 256);
  return new Uint8Array(bits);
}

/** The bytes inside a sealed blob, or null if this key doesn't open it. */
async function unseal(key, bytes) {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12),
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

const opensTheLock = async (key, lock) =>
  new TextDecoder().decode(await unseal(key, toBytes(lock.check)) ?? new Uint8Array())
  === CHECK;

/**
 * The key for this keyphrase, or null if it's the wrong phrase. Stretching it is
 * slow on purpose (a few hundred thousand rounds of PBKDF2), which is what stops
 * anyone with the locked files from guessing phrases quickly. A right phrase is
 * remembered on this device.
 */
export async function unlock(lock, phrase) {
  const raw = await stretch(phrase, lock);
  const key = await importKey(raw);
  if (!await opensTheLock(key, lock)) return null;
  saveSetting(SETTING, toBase64(raw));
  return key;
}

/** The key saved on this device, if there's one and it still fits the lock. */
export async function rememberedKey(lock) {
  const saved = loadSetting(SETTING);
  if (typeof saved !== "string") return null;
  try {
    const key = await importKey(toBytes(saved));
    return await opensTheLock(key, lock) ? key : null;
  } catch {
    return null; // not base64 any more, or not a key
  }
}

/** Downloads one locked file and opens it. Throws if it can't be fetched or opened. */
export async function openFile(key, name) {
  const response = await fetch(file(name));
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const opened = await unseal(key, new Uint8Array(await response.arrayBuffer()));
  if (!opened) throw new Error(`${name} didn't open`);
  return opened;
}

/** Opens a locked JPEG into a URL an <img> can show. */
export async function openPhoto(key, name) {
  const bytes = await openFile(key, name);
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

/** Opens locked JSON. */
export async function openJson(key, name) {
  return JSON.parse(new TextDecoder().decode(await openFile(key, name)));
}
