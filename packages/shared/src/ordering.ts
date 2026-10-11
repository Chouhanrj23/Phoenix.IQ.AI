/**
 * P8 -- the one string ordering every deterministic output uses.
 *
 * `String.prototype.localeCompare` follows the HOST's default collation, so
 * the same input sorted differently on differently configured machines: a
 * Danish host puts `Aardvark` after `Zebra` ("aa" collates as "å") and
 * `Apple` before `apple`; a Swedish host puts `Zebra` before `Öl`. Bundles,
 * OKF documents and graph write plans built from identical input were
 * therefore not byte-identical across hosts (BR-13, FR-DET-07). Even a FIXED
 * locale would not be stable, since collation data changes with ICU
 * versions.
 *
 * This compares UTF-16 code units: total, locale-free, and identical on
 * every host and Node version -- the same rule the OKF serializer already
 * uses for map keys. It is for machine-facing ordering. Human-facing lists
 * (UI) may still use locale-aware collation.
 */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
