import type { LinksFunction } from "react-router";
import { Outlet } from "react-router";

import { buttonVariants } from "~/components/ui/Button";
import { cn } from "~/utils/cn";

import { MobileMenu } from "./components/MobileMenu";
import { ThemeToggle } from "./components/ThemeToggle";
import tailwindHref from "./tailwind.css?url";
import { THEME_SCRIPT } from "./utils/theme";

/**
 * Marketing-site shell: nav header + footer, wrapping every public page
 * (`_marketing._index`, and future pages like pricing/about) via a pathless
 * layout route. Scoped Tailwind stylesheet only loads on these routes:
 * embedded admin routes under `app.*` keep using Polaris Web Components
 * untouched.
 */
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindHref },
];

const SECTION_LINKS: { href: string; label: string }[] = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#what-syncs", label: "What syncs" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export default function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      {/* Before anything paints: sets the theme (see utils/theme.ts). */}
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <span className="shrink-0 text-lg font-semibold">StoreBridge</span>
          <nav className="flex items-center gap-3 whitespace-nowrap md:gap-6 text-sm text-neutral-600">
            {/* Below md the links move into MobileMenu: they don't fit
                beside the logo on a phone. */}
            {SECTION_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="hidden hover:text-neutral-900 md:inline"
              >
                {label}
              </a>
            ))}
            <a href="#login" className={cn(buttonVariants({ size: "sm" }))}>
              Log in
            </a>
            <ThemeToggle />
            <MobileMenu links={SECTION_LINKS} />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-500">
        StoreBridge: keep the Shopify stores you run in sync.
      </footer>
    </div>
  );
}
