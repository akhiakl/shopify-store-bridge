import { LoginForm } from "~/marketing/LoginForm";
import marketingStyles from "~/marketing/marketing.module.css";

import styles from "./styles.module.css";

/**
 * The pairing-status mockup mirrors app.stores_.authorize.tsx's real
 * "pending" state and IncomingRequestsList's PENDING badge — this is what
 * a merchant actually sees mid-pairing, not an invented product shot.
 */
export function Hero({ showForm }: { showForm: boolean }) {
  return (
    <section className={styles.hero}>
      <div>
        <span className={styles.heroBadge}>Embedded Shopify app</span>
        <h1 className={styles.heroHeading}>
          Pair your stores without sharing a login.
        </h1>
        <p className={styles.heroText}>
          StoreBridge links your Shopify stores into sync groups and hands each
          pairing a one-time authorization link — approved from the target
          store&apos;s own admin, never a shared password or a third party in
          the middle.
        </p>
        {showForm && <LoginForm id="hero-shop" variant="labeled" />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardStores}>
            <span>eu-flagship</span>
            <span className={styles.cardArrow}>→</span>
            <span>eu-outlet</span>
          </div>
          <span className={styles.cardBadge}>PENDING</span>
        </div>
        <div className={styles.cardRow}>
          <span className={styles.cardRowLabel}>Sync group</span>
          <span>EU expansion</span>
        </div>
        <div className={styles.cardRow}>
          <span className={styles.cardRowLabel}>Requested</span>
          <span>4 minutes ago</span>
        </div>
        <div className={styles.cardRow}>
          <span className={styles.cardRowLabel}>Link expires</span>
          <span>in 11 minutes</span>
        </div>
        <div className={styles.cardActions}>
          <button className={marketingStyles.buttonSecondary} type="button">
            Decline
          </button>
          <button className={marketingStyles.buttonPrimary} type="button">
            Approve pairing
          </button>
        </div>
      </div>
    </section>
  );
}
