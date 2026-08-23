import marketingStyles from "~/marketing/marketing.module.css";

import styles from "./styles.module.css";

/**
 * Mirrors the real flow order (pairing.server.ts's requestPairing →
 * getPairingLinkStatus → approvePairingRequest), not an idealized product
 * pitch — this is genuinely a three-step sequence, so numbering it is
 * accurate, not decorative.
 */
export function HowItWorks() {
  return (
    <section id="how" className={styles.how}>
      <div className={styles.howInner}>
        <h2 className={styles.sectionHeading}>
          Three steps between &ldquo;invite&rdquo; and &ldquo;in sync&rdquo;
        </h2>
        <div className={styles.howGrid}>
          <div>
            <span className={`${styles.howStep} ${marketingStyles.mono}`}>
              01 · INVITE
            </span>
            <h3 className={styles.howItemHeading}>Name a target store</h3>
            <p className={styles.howItemText}>
              From a store you already run, enter the domain of the store you
              want to pair — a bare handle or the full .myshopify.com address
              both work.
            </p>
          </div>
          <div>
            <span className={`${styles.howStep} ${marketingStyles.mono}`}>
              02 · AUTHORIZE
            </span>
            <h3 className={styles.howItemHeading}>
              The target approves it themselves
            </h3>
            <p className={styles.howItemText}>
              A one-time link goes to whoever runs the target store. Only
              opening it from that store&apos;s own authenticated admin can
              approve the pairing — StoreBridge never asks for its password.
            </p>
          </div>
          <div>
            <span className={`${styles.howStep} ${marketingStyles.mono}`}>
              03 · SYNC
            </span>
            <h3 className={styles.howItemHeading}>Stores stay linked</h3>
            <p className={styles.howItemText}>
              Approved pairings live in a sync group you can see and manage from
              either store — decline, revisit, or grow the group at any time.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
