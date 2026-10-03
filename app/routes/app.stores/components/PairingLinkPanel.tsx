import { useState } from "react";

import { AUTH_TOKEN_TTL_MINUTES } from "~/routes/app.stores/authTokenTtl";

interface PairingLinkPanelProps {
  authorizeUrl: string;
}

/**
 * Shareable pairing-authorization link: a real clickable link plus a copy
 * button with visible confirmation, used everywhere a freshly (re)issued
 * link needs to be handed to the source to send out-of-band (see
 * store-pairing.md). A plain readonly text field made the link easy to
 * miss and hard to act on directly.
 */
export function PairingLinkPanel({ authorizeUrl }: PairingLinkPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(authorizeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied
      // permission) — the link above is still selectable/clickable as a
      // fallback, so this failure needs no user-facing error.
    }
  }

  return (
    <s-stack gap="small-100">
      <s-paragraph>Expires in {AUTH_TOKEN_TTL_MINUTES} minutes.</s-paragraph>
      <s-link href={authorizeUrl} target="_blank">
        {authorizeUrl}
      </s-link>
      <s-stack direction="inline" gap="small-100">
        <s-button onClick={handleCopy}>
          {copied ? "Copied!" : "Copy link"}
        </s-button>
      </s-stack>
    </s-stack>
  );
}
