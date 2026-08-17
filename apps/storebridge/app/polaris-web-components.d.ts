// `@shopify/polaris-types` (currently 1.0.7, the latest published version —
// verified by inspecting node_modules/@shopify/polaris-types directly, since
// Shopify Dev MCP isn't connected this session) doesn't yet ship type
// definitions for `<s-app-nav>`, even though it's used in the current
// shopify-app-template-react-router. Remove this file once that package
// catches up — check by searching its dist/polaris.d.ts for "s-app-nav".
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

export {};
