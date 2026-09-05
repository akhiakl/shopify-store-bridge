import type { LinksFunction } from "react-router";
import { Outlet } from "react-router";

import { buttonVariants } from "~/components/ui/Button";
import { cn } from "~/utils/cn";

import tailwindHref from "./tailwind.css?url";

/**
 * Marketing-site shell: nav header + footer, wrapping every public page
 * (`_marketing._index`, and future pages like pricing/about) via a pathless
 * layout route. Scoped Tailwind stylesheet only loads on these routes —
 * embedded admin routes under `app.*` keep using Polaris Web Components
 * untouched.
 */
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindHref },
];

export default function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold">StoreBridge</span>
          <nav className="flex items-center gap-6 text-sm text-neutral-600">
            <a href="#how-it-works" className="hover:text-neutral-900">
              How it works
            </a>
            <a href="#features" className="hover:text-neutral-900">
              Features
            </a>
            <a href="#login" className={cn(buttonVariants({ size: "sm" }))}>
              Log in
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-500">
        StoreBridge — sync Shopify metaobject and metafield definitions between
        stores.
      </footer>
    </div>
  );
}
