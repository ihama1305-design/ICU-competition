// How features.json names a feature's objects. Its own module, with no Three.js, so check 14 reads links the way the page does.

/** "addon:tv|tvplay=on,orientation" -> { kind: "addon", arg: "tv", when: { tvplay: ["on", "orientation"] } } */
export function parseObject(s) {
  const [what, cond] = s.split("|"), [kind, arg = ""] = what.split(":");
  const when = {};
  if (cond) for (const part of cond.split("&")) { const [g, vs] = part.split("="); when[g] = vs.split(","); }
  return { kind, arg, when };
}
