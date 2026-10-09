// `@shopify/polaris-types` (1.1.0, the latest published version) doesn't
// ship type definitions for `<s-app-nav>`, which comes from App Bridge,
// even though it's used in the current shopify-app-template-react-router.
// Remove this file once that package catches up: check by searching its
// dist/polaris.d.ts for "s-app-nav".
//
// React 19's types only read `React.JSX`, so this augments the "react"
// module. A global `JSX` namespace here would shadow every Polaris element.
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

export {};
