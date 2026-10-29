import Page, { H1, H2 } from "./Page";

/** DRAFT: written from docs/DATA_MODEL.md and docs/SECURITY.md. The owner must review it; it is not legal advice. */
export default function Privacy() {
  return (
    <Page path="/privacy">
      <H1>Privacy policy</H1>
      <p className="mt-4 text-sm text-white/60">Draft, pending review by the service owner. Last updated 29 October 2026.</p>

      <H2>What we store</H2>
      <ul className="list-disc space-y-2 pl-6 text-white/80">
        <li>
          <strong>Your Google account basics:</strong> the name, profile picture and email address Google shares when you sign in, and
          an internal user ID.
        </li>
        <li>
          <strong>What you follow:</strong> the software and topics in your library, and whether each one sends notifications.
        </li>
        <li>
          <strong>Your settings:</strong> which categories of release you want to hear about.
        </li>
        <li>
          <strong>Notification tokens:</strong> an identifier for each device that receives push notifications.
        </li>
        <li>
          <strong>Your plan:</strong> Free, Pro or Enterprise, and its expiry date.
        </li>
      </ul>

      <H2>Why</H2>
      <p className="max-w-2xl text-white/80">
        To show your feed, to send the notifications you asked for, and to apply your plan limits. We do not sell your data and we
        do not show advertising.
      </p>

      <H2>Who processes it</H2>
      <p className="max-w-2xl text-white/80">
        Release Scope runs on Google Cloud and Firebase (sign-in, database, push notifications) and is served through Vercel.
        Public changelogs are read and summarised by a Google Gemini model; your personal data is not sent to it.
      </p>

      <H2>Deleting your data</H2>
      <p className="max-w-2xl text-white/80">
        Ask us and we will delete your account record, your library and your notification tokens. Contact: [the service owner will
        add a contact address here before this page is relied on].
      </p>
    </Page>
  );
}
