/**
 * Checkout branding split into areas a merchant picks one by one: each
 * design token group (`designTokens.colors`), each shared component
 * (`components.header`) and each surface's components
 * (`surfaces.checkout.components.orderSummary`). Works on the input shape
 * `toCheckoutStyling` produces, so source and target compare directly.
 */

type Node = Record<string, unknown>;

/** Leaf values as the page shows them: a file slot holds its filename. */
export type StylingValue = string | number | boolean | null;

/** How many path segments make an area, by the branding's top-level key. */
const AREA_DEPTH: Record<string, number> = {
  designTokens: 2,
  components: 2,
  surfaces: 4,
};

/** A font group is one of these: sending the source's replaces the other,
 * so the other isn't also reset alongside it. */
const FONT_VARIANTS = ["customFontGroup", "shopifyFontGroup"];

function isNode(value: unknown): value is Node {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getAt(node: unknown, path: string[]): unknown {
  let current = node;
  for (const key of path) {
    if (!isNode(current)) return undefined;
    current = current[key];
  }
  return current;
}

function setAt(node: Node, path: string[], value: unknown) {
  let current = node;
  for (const key of path.slice(0, -1)) {
    if (!isNode(current[key])) current[key] = {};
    current = current[key] as Node;
  }
  current[path[path.length - 1]] = value;
}

/** Every area `branding` sets something in, as dot-joined paths. */
export function stylingAreas(branding: unknown): string[] {
  const areas: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    const depth = AREA_DEPTH[path[0]];
    if (path.length > 0 && (path.length === depth || !isNode(node))) {
      areas.push(path.join("."));
      return;
    }
    if (!isNode(node)) return;
    for (const [key, child] of Object.entries(node))
      walk(child, [...path, key]);
  };
  walk(branding, []);
  return areas;
}

/** Both stores' areas, deduplicated and in a stable order. */
export function allStylingAreas(source: unknown, target: unknown): string[] {
  return [
    ...new Set([...stylingAreas(source), ...stylingAreas(target)]),
  ].sort();
}

/** The source's settings, plus a null (Shopify's "reset to default") for
 * each one only the target sets, so the target ends up identical. */
function withResets(source: unknown, target: unknown): unknown {
  if (!isNode(source) || !isNode(target)) return source;
  const result: Node = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = withResets(value, target[key]);
  }
  const hasVariant = FONT_VARIANTS.some((key) => key in source);
  for (const key of Object.keys(target)) {
    if (key in source) continue;
    if (hasVariant && FONT_VARIANTS.includes(key)) continue;
    result[key] = null;
  }
  return result;
}

/**
 * Branding input that makes each of `areas` on the target an exact copy
 * of the source's: an area the source doesn't customize is reset whole.
 * Areas left out aren't sent, so the target keeps them as they are.
 */
export function mirrorBranding({
  source,
  target,
  areas,
}: {
  source: unknown;
  target: unknown;
  areas: string[];
}): Node {
  const input: Node = {};
  for (const area of areas) {
    const path = area.split(".");
    const from = getAt(source, path);
    const to = getAt(target, path);
    if (from === undefined && to === undefined) continue;
    setAt(input, path, from === undefined ? null : withResets(from, to));
  }
  return input;
}

/** Whether a file slot (by its path) falls inside one of `areas`. */
export function isInAreas(path: string[], areas: string[]): boolean {
  const joined = path.join(".");
  return areas.some((area) => joined === area || joined.startsWith(`${area}.`));
}

function leaves(node: unknown, path: string[], out: Map<string, unknown>) {
  if (isNode(node)) {
    for (const [key, child] of Object.entries(node)) {
      leaves(child, [...path, key], out);
    }
  } else if (node !== undefined) {
    out.set(path.join("."), node);
  }
  return out;
}

function toValue(value: unknown): StylingValue {
  if (value === undefined || value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as StylingValue;
  }
  return JSON.stringify(value);
}

export interface StylingRow {
  /** Dot-joined path within the area. */
  setting: string;
  source: StylingValue;
  target: StylingValue;
  same: boolean;
}

export interface StylingAreaDiff {
  area: string;
  rows: StylingRow[];
  inSync: boolean;
}

/** Each area either store customizes, setting by setting. Unset counts as
 * a value: a setting only the target has makes the area out of sync,
 * since a sync resets it. */
export function compareStyling(
  source: unknown,
  target: unknown,
): StylingAreaDiff[] {
  return allStylingAreas(source, target).map((area) => {
    const path = area.split(".");
    const from = leaves(getAt(source, path), [], new Map());
    const to = leaves(getAt(target, path), [], new Map());
    const settings = [...new Set([...from.keys(), ...to.keys()])].sort();
    const rows = settings.map((setting) => {
      const sourceValue = toValue(from.get(setting));
      const targetValue = toValue(to.get(setting));
      return {
        setting,
        source: sourceValue,
        target: targetValue,
        same: sourceValue === targetValue,
      };
    });
    return { area, rows, inSync: rows.every((row) => row.same) };
  });
}
