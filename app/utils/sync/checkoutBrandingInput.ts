/** A file the branding points at, by URL. Files are per-store, so the sync
 * copies each one to the target and writes the target's ID at `path`. */
export interface StylingFileRef {
  path: string[];
  kind: "IMAGE" | "FONT";
  url: string;
}

/** Checkout and accounts branding in input shape, plus the files it uses.
 * Each file's slot holds its filename until the sync fills in an ID, so two
 * stores' branding can be compared without their IDs differing. Plain JSON:
 * it's saved in the job's plan. */
export interface CheckoutStyling {
  branding: Record<string, unknown>;
  files: StylingFileRef[];
}

type Node = Record<string, unknown>;
interface FontFace {
  sources?: string | null;
  weight?: number | null;
  genericFileId?: string | null;
}

const IMAGE = "CheckoutAndAccountsConfigurationBrandingImage";
const CUSTOM_FONTS = "CheckoutAndAccountsConfigurationBrandingCustomFontGroup";
const SHOPIFY_FONTS =
  "CheckoutAndAccountsConfigurationBrandingShopifyFontGroup";

/** The last path segment, without a query string: what a file keeps when
 * it's created on another store from this URL. */
export function fileNameFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
}

function firstSourceUrl(sources: string | null | undefined): string | null {
  return sources?.match(/url\(\s*["']?([^"')]+)/)?.[1] ?? null;
}

/**
 * The font-library handle (`assistant_n4`) the input needs; the output
 * only gives a name, weight and CSS sources. The handle is the font file's
 * name on Shopify's font CDN (`…/assistant_n4.<hash>.woff2`), with the
 * name and weight as a fallback.
 */
export function shopifyFontHandle(name: string, font: FontFace): string {
  const url = firstSourceUrl(font.sources);
  const fromUrl = url && fileNameFromUrl(url).match(/^([a-z0-9_]+_[ni]\d)\./);
  if (fromUrl) return fromUrl[1];
  const family = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return `${family}_n${Math.round((font.weight ?? 400) / 100)}`;
}

function convert(
  value: unknown,
  path: string[],
  files: StylingFileRef[],
): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return value;
  const node = value as Node;

  if (node.__typename === IMAGE) {
    const url = (node.image as { url?: string } | null)?.url;
    if (!url) return undefined;
    files.push({ path: [...path, "mediaImageId"], kind: "IMAGE", url });
    return { mediaImageId: fileNameFromUrl(url) };
  }
  if (node.__typename === SHOPIFY_FONTS) {
    const name = String(node.name ?? "");
    return compact({
      shopifyFontGroup: compact({
        baseFontHandle: node.base
          ? shopifyFontHandle(name, node.base as FontFace)
          : undefined,
        boldFontHandle: node.bold
          ? shopifyFontHandle(name, node.bold as FontFace)
          : undefined,
        loadingStrategy: node.loadingStrategy ?? undefined,
      }),
    });
  }
  if (node.__typename === CUSTOM_FONTS) {
    const face = (key: "base" | "bold") => {
      const font = node[key] as FontFace | null;
      const url = firstSourceUrl(font?.sources);
      if (!font || !url) return undefined;
      const slot = [...path, "customFontGroup", key, "genericFileId"];
      files.push({ path: slot, kind: "FONT", url });
      return compact({
        genericFileId: fileNameFromUrl(url),
        weight: font.weight ?? undefined,
      });
    };
    return compact({
      customFontGroup: compact({
        base: face("base"),
        bold: face("bold"),
        loadingStrategy: node.loadingStrategy ?? undefined,
      }),
    });
  }
  if ("__typename" in node) return undefined;

  return compact(
    Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        convert(child, [...path, key], files),
      ]),
    ),
  );
}

/** Drops unset keys; an object with nothing set is itself unset, so the
 * input only carries what the source actually customized. */
function compact(node: Node): Node | undefined {
  const entries = Object.entries(node).filter(([, v]) => v !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * Turns `CHECKOUT_STYLING_QUERY`'s branding into
 * `CheckoutAndAccountsConfigurationInput.branding`. Unset (null) settings
 * are left out rather than sent as null, so a sync copies what the source
 * customized and leaves the target's other settings alone.
 */
export function toCheckoutStyling(branding: unknown): CheckoutStyling {
  const files: StylingFileRef[] = [];
  const converted = convert(branding, [], files);
  return {
    branding: (converted as Record<string, unknown>) ?? {},
    files,
  };
}

/** True when every setting the source customized has the same value on
 * the target. Files compare by filename (see CheckoutStyling). Settings
 * only the target customized don't count: a sync never clears them. */
export function isStylingInSync(source: unknown, target: unknown): boolean {
  if (source === null || typeof source !== "object") return source === target;
  if (target === null || typeof target !== "object") return false;
  return Object.entries(source).every(([key, value]) =>
    isStylingInSync(value, (target as Node)[key]),
  );
}

/** A copy of `branding` with each file slot set to the target's ID. */
export function withFileIds(
  branding: Record<string, unknown>,
  ids: { path: string[]; id: string }[],
): Record<string, unknown> {
  const copy = structuredClone(branding);
  for (const { path, id } of ids) {
    let node: Node = copy;
    for (const key of path.slice(0, -1)) node = node[key] as Node;
    node[path[path.length - 1]] = id;
  }
  return copy;
}
