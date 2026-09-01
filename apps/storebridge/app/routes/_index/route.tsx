import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "~/shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>StoreBridge</h1>
        <p className={styles.text}>
          Pair Shopify stores and keep their metaobject and metafield
          definitions in sync.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Store pairing</strong>. Connect a source store to one or
            more target stores, with each pairing approved from the target side
            before anything syncs.
          </li>
          <li>
            <strong>Definition sync</strong>. Push metaobject and metafield
            definitions — and SHOP-level metafield values — from a source store
            to its approved targets with one click.
          </li>
          <li>
            <strong>Job history</strong>. See exactly what synced, what was
            skipped as already existing, and what failed, per target and per
            item.
          </li>
        </ul>
      </div>
    </div>
  );
}
