import { Link } from "react-router-dom";
import { BRAND } from "../../brand";
import { usePublicActions } from "../../seo/PublicActions";
import Page, { H1, H2 } from "./Page";

export const FAQ = [
  {
    q: "What is Release Scope?",
    a: "A service that watches the changelogs of the software you follow and notifies you when something genuinely new ships.",
  },
  {
    q: "How do you know a release is new?",
    a: "For sources with structured data, such as GitHub releases, npm and PyPI, we compare version numbers directly. For other pages we only notify when the extracted release is newer than the last one we recorded.",
  },
  {
    q: "Is it free?",
    a: "Yes. The Free plan follows up to 5 items with a 30-day history. Pro and Enterprise remove the limits.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Release Scope runs in your browser. An Android app is in development.",
  },
  {
    q: "What if the software I use is not in the catalogue?",
    a: "Search the catalogue first. If it is missing, ask us to find its changelog and we will add it.",
  },
];

export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: BRAND.name, url: `${BRAND.origin}/`, description: BRAND.description },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

const STEPS = [
  { title: "Follow", body: "Search for the software you rely on and follow it. Five items are free." },
  { title: "We watch", body: "A server reads each changelog on a schedule and skips pages that have not changed." },
  { title: "You're told", body: "When a genuinely new release ships, it lands in your feed with a plain-language summary." },
];

export default function Home() {
  const { signIn, signingIn } = usePublicActions();
  return (
    <Page path="/" jsonLd={homeJsonLd}>
      <section className="py-10 text-center sm:py-16">
        <H1>{BRAND.tagline}</H1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/70">
          Follow the software you rely on. Release Scope reads the changelogs for you and tells you when something
          genuinely new ships: new features, security fixes and major releases, without the noise.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={signIn}
            disabled={signingIn}
            className="rounded-full bg-primary px-7 py-3 text-base font-bold text-black disabled:opacity-60"
          >
            Get started free
          </button>
          <Link
            to="/demo"
            className="rounded-full border border-white/25 px-7 py-3 text-base font-semibold text-white no-underline hover:bg-white/10"
          >
            See the demo
          </Link>
        </div>
      </section>

      <section aria-label="Three steps">
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-bold text-primary">Step {i + 1}</p>
              <p className="mt-1 text-lg font-bold">{s.title}</p>
              <p className="mt-2 text-sm text-white/70">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <H2>Free to start</H2>
        <p className="max-w-2xl text-white/70">
          The Free plan follows up to 5 items with a 30-day release history. Need more?{" "}
          <Link to="/pricing" className="text-primary underline">
            See the plans
          </Link>
          .
        </p>
      </section>

      <section>
        <H2>Questions</H2>
        <dl className="space-y-5">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-white/70">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Page>
  );
}
