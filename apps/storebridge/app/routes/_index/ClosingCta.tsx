import { LoginForm } from "~/marketing/LoginForm";

import styles from "./styles.module.css";

export function ClosingCta() {
  return (
    <section className={styles.cta}>
      <div className={styles.ctaBox}>
        <h2 className={styles.ctaHeading}>Pair your first two stores</h2>
        <p className={styles.ctaText}>
          Installs on the source store in a minute. The target store only needs
          to open the link you send it and approve — from its own admin, on its
          own terms.
        </p>
        <LoginForm id="cta-shop" variant="compact" />
      </div>
    </section>
  );
}
