import styles from "./marketing.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <span>© {new Date().getFullYear()} StoreBridge</span>
        <div className={styles.footerLinks}>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </div>
      </div>
    </footer>
  );
}
