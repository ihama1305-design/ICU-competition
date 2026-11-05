// A room as a short code in the URL hash, so a link restores it exactly.
// One character each for the format version, room and view, two for the time, then one per option group in the order of its
// `code` in options.json, with any custom colours after a ~. The codes are append-only, so links made today keep working:
// a group added later is simply missing from an old code, and takes its default.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const VERSION = "1";
const CUSTOM = "_";

const groupsInOrder = data => data.sections.flatMap(s => s.groups).sort((a, b) => a.code - b.code);

export function encodeSpec(data, state, selected) {
  const tick = Math.round(state.hour * 12); // five-minute steps
  let code = VERSION + ALPHABET[data.rooms.indexOf(state.room)] + ALPHABET[data.views.indexOf(state.view)];
  code += ALPHABET[Math.floor(tick / 62)] + ALPHABET[tick % 62];
  const customs = [];
  for (const g of groupsInOrder(data)) {
    if (selected[g.id] === "custom") {
      code += CUSTOM;
      customs.push(selected[`${g.id}:custom`].slice(1));
    } else {
      code += ALPHABET[g.options.find(o => o.id === selected[g.id]).code];
    }
  }
  return customs.length ? `${code}~${customs.join("~")}` : code;
}

/** Read a hash like #c=...; returns null if it isn't a valid code. */
export function decodeSpec(data, hash) {
  const m = /^#c=([0-9a-zA-Z_~]+)$/.exec(hash);
  if (!m) return null;
  const [body, ...hex] = m[1].split("~");
  if (body.length < 5 || body[0] !== VERSION || !hex.every(h => /^[0-9a-fA-F]{6}$/.test(h))) return null;
  const room = data.rooms[ALPHABET.indexOf(body[1])], view = data.views[ALPHABET.indexOf(body[2])];
  const hour = (ALPHABET.indexOf(body[3]) * 62 + ALPHABET.indexOf(body[4])) / 12;
  if (!room || !view || Number.isNaN(hour) || hour < 0 || hour > 24) return null;
  const selected = {};
  let customAt = 0;
  for (const g of groupsInOrder(data)) {
    const ch = body[5 + g.code];
    if (ch === undefined) { selected[g.id] = g.default; continue; }
    if (ch === CUSTOM) {
      if (!g.custom || customAt >= hex.length) return null;
      selected[g.id] = "custom";
      selected[`${g.id}:custom`] = `#${hex[customAt++].toLowerCase()}`;
      continue;
    }
    const option = g.options.find(o => o.code === ALPHABET.indexOf(ch));
    if (!option) return null;
    selected[g.id] = option.id;
  }
  return { room, view, hour, selected };
}
