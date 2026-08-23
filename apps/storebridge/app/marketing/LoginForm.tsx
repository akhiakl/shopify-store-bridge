import { Form } from "react-router";

import styles from "./marketing.module.css";

/**
 * The public page's own shop-domain login form — posts to /auth/login,
 * same as auth.login/route.tsx's form, but styled for the marketing page
 * rather than the bare CLI-template form. `labeled` sits inline in the
 * Hero next to its own field label; `compact` centers as a single row for
 * the closing CTA, where the surrounding section already explains what
 * the field is for.
 */
export function LoginForm({
  variant,
  id = "shop",
}: {
  variant: "labeled" | "compact";
  /** Field id, namespaced per instance — the Hero and ClosingCta sections
   * each render one of these on the same page, so a shared default would
   * collide. */
  id?: string;
}) {
  return (
    <Form
      className={
        variant === "compact" ? styles.loginFormCompact : styles.loginForm
      }
      method="post"
      action="/auth/login"
    >
      <div className={styles.loginField}>
        {variant === "labeled" && (
          <label className={styles.loginLabel} htmlFor={id}>
            Shop domain
          </label>
        )}
        <input
          className={styles.loginInput}
          type="text"
          name="shop"
          id={id}
          placeholder="your-store.myshopify.com"
        />
        {variant === "labeled" && (
          <span className={styles.loginHint}>
            e.g. your-store.myshopify.com
          </span>
        )}
      </div>
      <button className={styles.buttonPrimary} type="submit">
        Log in
      </button>
    </Form>
  );
}
