export type Theme = "light" | "dark";

const STORAGE_KEY = "storebridge-theme";

/** The visitor's saved choice, if any. Storage can throw (private mode,
 * blocked site data), which counts as no choice. */
export function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit.
  }
}

/** The device's dark-mode query, where the browser has one. */
export function systemDarkQuery(): MediaQueryList | undefined {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : undefined;
}

/** The theme in effect: the saved choice, else the device setting. */
export function currentTheme(): Theme {
  return savedTheme() ?? (systemDarkQuery()?.matches ? "dark" : "light");
}

/** Fired on window whenever applyTheme changes the page's theme. */
export const THEME_CHANGE_EVENT = "storebridge-theme-change";

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** The theme the page shows now, as the inline script set it. */
export function shownTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Runs inline before the page paints, so a saved or system dark theme
 * never flashes light first. Kept in sync with the functions above by
 * hand: it can't import them.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();`;
