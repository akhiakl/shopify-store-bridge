/**
 * The app's version (package.json, see vite.config.ts), muted at the end
 * of a page and right-aligned to its content. Rendered as the last child of
 * each page's `s-page` so it lines up with the page column; outside it,
 * it would sit against the iframe's edge instead.
 */
export function AppVersion() {
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  return (
    <s-stack alignItems="end">
      <s-text color="subdued">{`StoreBridge v${version}`}</s-text>
    </s-stack>
  );
}
