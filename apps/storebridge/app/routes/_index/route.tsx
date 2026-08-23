import type { LinksFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { login } from "~/shopify.server";
import { Nav } from "~/marketing/Nav";
import { Footer } from "~/marketing/Footer";
import marketingStyles from "~/marketing/marketing.module.css";

import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Features } from "./Features";
import { ClosingCta } from "./ClosingCta";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Karla:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function PublicLanding() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={marketingStyles.page}>
      <Nav showLoginLink={showForm} />
      <Hero showForm={showForm} />
      <HowItWorks />
      <Features />
      {showForm && <ClosingCta />}
      <Footer />
    </div>
  );
}
