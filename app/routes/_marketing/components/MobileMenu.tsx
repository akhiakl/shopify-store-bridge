import { useEffect, useRef } from "react";

interface MobileMenuProps {
  links: readonly { href: string; label: string }[];
}

/** The section links on phones, where they don't fit in the header: a
 * native `<details>` dropdown, so it opens before any script loads.
 * Picking a link, tapping outside it or pressing Escape closes it. */
export function MobileMenu({ links }: MobileMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="relative md:hidden">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-neutral-300 [&::-webkit-details-marker]:hidden"
        aria-label="Menu"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-44 rounded-md border border-neutral-200 bg-white py-1 shadow-md">
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="block px-4 py-2 text-neutral-700 hover:bg-neutral-50"
            onClick={(e) =>
              e.currentTarget.closest("details")?.removeAttribute("open")
            }
          >
            {label}
          </a>
        ))}
      </div>
    </details>
  );
}
