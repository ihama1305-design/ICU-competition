// Saved rooms: a name and a share code each, kept in this browser's localStorage and nowhere else. A code holds only the
// room's design (finishes, furniture, lighting choices, the view and the time): never a mode, a PACS scenario or Suggest a room
// answers. Storage can be missing or refused (a private window, blocked site data), so every read and write is guarded.

const KEY = "icu-configurator-saved-rooms";
export const MAX_PRESETS = 12;

export function readPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter(p => p && typeof p.name === "string" && typeof p.code === "string").slice(0, MAX_PRESETS) : [];
  } catch {
    return [];
  }
}

function writePresets(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Save under a name; the same name, in any case, replaces the old one. Returns { ok, reason, replaced, list }. */
export function savePreset(name, code) {
  const list = readPresets(), at = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  if (at < 0 && list.length >= MAX_PRESETS) return { ok: false, reason: "full", list };
  const next = list.slice(), entry = { name, code, saved: new Date().toISOString() };
  if (at < 0) next.push(entry); else next[at] = entry;
  return writePresets(next) ? { ok: true, replaced: at >= 0, list: next } : { ok: false, reason: "storage", list };
}

export function deletePreset(name) {
  const next = readPresets().filter(p => p.name !== name);
  return writePresets(next) ? next : null;
}
