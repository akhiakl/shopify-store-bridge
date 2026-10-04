import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { Badge } from "~/components/ui/Badge";
import { buttonVariants } from "~/components/ui/Button";
import { cn } from "~/utils/cn";
import { login } from "~/shopify.server";

import { FaqSection } from "./components/FaqSection";
import { FeatureGrid } from "./components/FeatureGrid";
import { HeroPreviewCard } from "./components/HeroPreviewCard";
import { StepsSection } from "./components/StepsSection";
import { WhatSyncsSection } from "./components/WhatSyncsSection";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Any embedded load belongs in the app, not on the landing page: the
  // admin always sends one of these when it opens the app in its iframe.
  const { searchParams } = url;
  if (
    searchParams.get("shop") ||
    searchParams.get("host") ||
    searchParams.get("embedded") === "1"
  ) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function MarketingHome() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <>
      <section className="mx-auto grid max-w-5xl items-center gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <Badge variant="outline">Embedded Shopify app</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Keep your Shopify stores in sync.
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            Connect stores you run and copy metafields, metaobjects, policies,
            collections, menus, locations and checkout styling from one to
            another. You choose what goes, and job history shows what happened.
          </p>

          {showForm && (
            <Form
              id="login"
              className="mt-8 max-w-sm"
              method="post"
              action="/auth/login"
            >
              <label className="block text-sm font-medium">
                Shop domain
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    type="text"
                    name="shop"
                    placeholder="example.myshopify.com"
                    required
                    aria-describedby="shop-domain-hint"
                  />
                  <button type="submit" className={cn(buttonVariants())}>
                    Log in
                  </button>
                </div>
              </label>
              <span
                id="shop-domain-hint"
                className="mt-2 block text-xs text-neutral-500"
              >
                e.g. example.myshopify.com
              </span>
            </Form>
          )}
        </div>

        <div className="flex justify-center md:justify-end">
          <HeroPreviewCard />
        </div>
      </section>

      <StepsSection />
      <FeatureGrid />
      <WhatSyncsSection />
      <FaqSection />
    </>
  );
}
