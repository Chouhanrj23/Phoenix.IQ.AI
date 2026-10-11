/**
 * P8 -- which node kinds the Graph Explorer offers, and in what order.
 *
 * The page used to keep only kinds listed in its own hard-coded order, so a
 * node whose kind was missing from that list was filtered out of the canvas
 * while the API had returned it successfully -- the same blank-canvas class
 * of bug PC-04 fixed once for `Api`/`Entity`. By P7 the graph already held
 * `ReviewDecision` nodes the list did not know, and P8 adds `Conflict`,
 * `WorkItem` and `Capability`. Known kinds keep their curated order; any
 * other kind present is appended (alphabetically, so the order is stable)
 * instead of being hidden.
 */
export function orderGraphKinds(
  presentKinds: Iterable<string>,
  preferredOrder: readonly string[],
): string[] {
  const present = new Set(presentKinds);
  const known = preferredOrder.filter((kind) => present.has(kind));
  const preferred = new Set(preferredOrder);
  const unknown = [...present].filter((kind) => !preferred.has(kind)).sort();
  return [...known, ...unknown];
}
