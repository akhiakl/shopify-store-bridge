import { useEffect, useState } from "react";

/**
 * Auto-navigates the current tab to `url` after `delaySeconds`, showing a
 * live countdown so the redirect isn't a surprise, with a way to cancel it.
 * Built for ConnectStoreForm's post-pairing-request screen: pairing is
 * currently a same-owner, both-stores-in-hand flow (see authToken.server.ts),
 * so landing straight on the target store's approval screen is the
 * expected next step, not something to spring on someone unrelated.
 *
 * A plain `window.location.href` assignment rather than React Router
 * navigation — the authorize URL carries a different `shop` query param, and
 * only a real navigation (not a client-side route change within the same
 * session) makes the embedded admin re-authenticate against that shop.
 */
export function useRedirectCountdown(
  url: string | undefined,
  delaySeconds: number,
) {
  const [secondsLeft, setSecondsLeft] = useState(delaySeconds);
  const [cancelled, setCancelled] = useState(false);
  // Tracks which (url, delaySeconds) pair the state above belongs to, so a
  // change can be detected — and the countdown reset — during render
  // rather than in an effect (React's own recommended pattern for
  // "adjusting state when a prop changes"; avoids an extra render pass
  // versus doing the same reset via useEffect).
  const [trackedFor, setTrackedFor] = useState<[string | undefined, number]>([
    url,
    delaySeconds,
  ]);
  if (trackedFor[0] !== url || trackedFor[1] !== delaySeconds) {
    setTrackedFor([url, delaySeconds]);
    setSecondsLeft(delaySeconds);
    setCancelled(false);
  }

  useEffect(() => {
    if (!url || cancelled || secondsLeft <= 0) return;

    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [url, cancelled, secondsLeft]);

  useEffect(() => {
    if (url && !cancelled && secondsLeft <= 0) {
      window.location.href = url;
    }
  }, [url, cancelled, secondsLeft]);

  return { secondsLeft, cancel: () => setCancelled(true), cancelled };
}
