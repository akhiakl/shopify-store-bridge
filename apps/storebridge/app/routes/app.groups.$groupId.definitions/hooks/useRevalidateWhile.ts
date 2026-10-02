import { useEffect } from "react";
import { useRevalidator } from "react-router";

/** Re-runs the route's loaders every `intervalMs` while `active` is true,
 * so job progress made by the background worker shows up without a
 * manual refresh. Stops as soon as `active` turns false. */
export function useRevalidateWhile(active: boolean, intervalMs = 3000) {
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void revalidate(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, revalidate]);
}
