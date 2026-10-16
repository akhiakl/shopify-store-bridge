import { useSyncExternalStore } from "react";

import {
  THEME_CHANGE_EVENT,
  applyTheme,
  currentTheme,
  saveTheme,
  savedTheme,
  shownTheme,
  systemDarkQuery,
  type Theme,
} from "../utils/theme";

/** Re-renders on a theme change, and follows the device setting live
 * while the visitor hasn't picked a theme. */
function subscribe(onChange: () => void) {
  const query = systemDarkQuery();
  const onSystemChange = () => {
    if (!savedTheme()) applyTheme(currentTheme());
  };
  query?.addEventListener("change", onSystemChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    query?.removeEventListener("change", onSystemChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

/** Switches the marketing pages between light and dark and remembers the
 * choice. Until one is made, the page follows the device setting. */
export function ThemeToggle() {
  // The server can't see the visitor's theme: null until hydrated.
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    shownTheme,
    () => null,
  );
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        saveTheme(next);
        applyTheme(next);
      }}
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
        {theme === "dark" ? (
          // Sun: switch to light.
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
          </>
        ) : (
          // Moon: switch to dark.
          <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" />
        )}
      </svg>
    </button>
  );
}
