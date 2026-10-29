import Page, { H1, H2 } from "./Page";

/** DRAFT: the owner must review it; it is not legal advice. */
export default function Terms() {
  return (
    <Page path="/terms">
      <H1>Terms of service</H1>
      <p className="mt-4 text-sm text-white/60">Draft, pending review by the service owner. Last updated 29 October 2026.</p>

      <H2>The service</H2>
      <p className="max-w-2xl text-white/80">
        Release Scope watches public changelogs and tells you about new releases. Summaries are produced automatically and can be
        wrong or late. Check the vendor&apos;s own release notes before you rely on a summary, especially for security fixes.
      </p>

      <H2>Your account</H2>
      <p className="max-w-2xl text-white/80">
        You sign in with Google and are responsible for activity on your account. Do not use the service to attack it, overload it,
        or collect data about other users.
      </p>

      <H2>Plans</H2>
      <p className="max-w-2xl text-white/80">
        The Free plan has the limits shown on the pricing page. Paid plans are activated by us on request and may change.
      </p>

      <H2>No warranty</H2>
      <p className="max-w-2xl text-white/80">
        The service is provided as is, without any promise that it is accurate, complete or always available. To the extent the law
        allows, we are not liable for loss caused by relying on it.
      </p>

      <H2>Contact</H2>
      <p className="max-w-2xl text-white/80">[The service owner will add a contact address here before this page is relied on.]</p>
    </Page>
  );
}
