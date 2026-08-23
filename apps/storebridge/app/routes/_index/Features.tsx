import styles from "./styles.module.css";

export function Features() {
  return (
    <section id="features" className={styles.features}>
      <div className={styles.featuresInner}>
        <h2 className={styles.sectionHeading}>
          Built for teams running more than one store
        </h2>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="7" height="10" rx="1" />
                <rect x="14" y="3" width="7" height="18" rx="1" />
                <path d="M10 16h4" />
              </svg>
            </div>
            <h3 className={styles.featureHeading}>No shared logins</h3>
            <p className={styles.featureText}>
              Every pairing runs on a single-use authorization token, hashed at
              rest and never shown twice — approving one never requires handing
              over a password or admin access.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 11l2 2 4-4" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <h3 className={styles.featureHeading}>
              A status for every request
            </h3>
            <p className={styles.featureText}>
              Pending, approved, or declined — every pairing keeps a clear
              status and timestamp on both sides, so nothing is left wondering
              whether it went through.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="6" cy="18" r="2.5" />
                <circle cx="18" cy="12" r="2.5" />
                <path d="M8 7l8 4M8 17l8-4" />
              </svg>
            </div>
            <h3 className={styles.featureHeading}>One source, many targets</h3>
            <p className={styles.featureText}>
              Group multiple target stores under one sync group from a single
              source — invite them one at a time, at your own pace, without
              redoing setup for each.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
