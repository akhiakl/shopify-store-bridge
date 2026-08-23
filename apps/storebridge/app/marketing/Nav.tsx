import styles from "./marketing.module.css";

/**
 * Public-page nav — separate from app/routes/app.tsx's `<s-app-nav>`,
 * which only renders once installed and authenticated. This one shows
 * before a merchant has ever logged in.
 */
export function Nav({ showLoginLink }: { showLoginLink: boolean }) {
  return (
    <header className={styles.nav}>
      <div className={`${styles.container} ${styles.navInner}`}>
        <a href="/" className={styles.navBrand}>
          <svg
            className={styles.navMark}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="3" fill="currentColor" />
            <circle cx="19" cy="12" r="3" fill="currentColor" />
            <path
              d="M8 12h8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          StoreBridge
        </a>
        <nav className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          {showLoginLink && <a href="#login">Log in</a>}
        </nav>
      </div>
    </header>
  );
}
