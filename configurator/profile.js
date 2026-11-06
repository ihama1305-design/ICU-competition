// Tune it in: from answers to a room, using only the data in options.json. No 3D here, so every answer can be tested quickly.
// The result is a set of option selections, the same as a theme's, so it reaches the share code and can be compared and undone.

const matches = (when, answers) => !when || [when].flat().some(alt => Object.entries(alt).every(([k, values]) => values.includes(answers[k])));

/** Choose a theme, then apply the rules, highest tier first. What a tier sets, a lower tier can't change, and that gets reported. */
export function resolveProfile(data, answers) {
  const P = data.profile;
  const pick = P.themes.find(t => matches(t.when, answers));
  const theme = data.themes.find(t => t.id === pick.theme);
  const selections = {}, why = {}, locked = {}, overruled = [], applied = [];
  for (const section of data.sections) for (const g of section.groups) selections[g.id] = g.default;
  for (const [g, o] of Object.entries(theme.sets)) {
    selections[g] = o;
    why[g] = pick.because;
  }
  for (const tier of P.tiers) {
    for (const rule of P.rules.filter(r => r.tier === tier && matches(r.when, answers))) {
      applied.push(rule.id);
      for (const [g, o] of Object.entries(rule.sets)) {
        if (g in locked && locked[g] !== o) {
          overruled.push({ group: g, wanted: o, rule: rule.id });
          continue;
        }
        locked[g] = o;
        selections[g] = o;
        why[g] = rule.because;
      }
    }
  }
  return { theme: theme.id, selections, why, overruled, applied };
}

/** What differs between two sets of selections, in the panel's order, with the labels a person sees. */
export function differences(data, before, after) {
  const label = (g, id) => (id === "custom" ? "custom colour" : g.options.find(o => o.id === id)?.label ?? id);
  const out = [];
  for (const section of data.sections) {
    for (const g of section.groups) {
      if (before[g.id] !== after[g.id]) out.push({ group: g.id, label: g.label, from: label(g, before[g.id]), to: label(g, after[g.id]) });
    }
  }
  return out;
}

/** The label of what a rule left in place when a higher tier won, such as "Sofa-bed". */
export function optionLabel(data, groupId, optionId) {
  const g = data.sections.flatMap(s => s.groups).find(x => x.id === groupId);
  return g?.options.find(o => o.id === optionId)?.label ?? optionId;
}
