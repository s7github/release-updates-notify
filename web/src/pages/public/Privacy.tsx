import Page, { H1, H2 } from "./Page";

const CONTACT = "support@releasescope.com";
const LI = "list-disc space-y-2 pl-6 text-white/80";
const P = "max-w-2xl text-white/80";

/**
 * Written from docs/DATA_MODEL.md and docs/SECURITY.md to satisfy Google's OAuth branding review.
 * It is not legal advice: the owner should review it, and must update it when data handling changes
 * (new OAuth scopes, analytics, billing, new processors).
 */
export default function Privacy() {
  return (
    <Page path="/privacy">
      <H1>Privacy policy</H1>
      <p className="mt-4 text-sm text-white/60">Last updated 29 October 2026.</p>
      <p className={`${P} mt-6`}>
        Release Scope (releasescope.com) tells you when the software you follow ships a new release. This policy explains what
        personal data we handle, why, who else touches it, and how you can have it deleted.
      </p>

      <H2>What we collect</H2>
      <ul className={LI}>
        <li>
          <strong>Google account basics.</strong> When you sign in with Google we receive your name, email address and profile
          picture, plus an internal user ID. We request only the basic sign-in permissions (<code>openid</code>,{" "}
          <code>email</code> and <code>profile</code>). We do not access your Gmail, Drive, Calendar, contacts or any other Google
          data.
        </li>
        <li>
          <strong>What you follow.</strong> The software and topics in your library and whether each one sends notifications.
        </li>
        <li>
          <strong>Your settings.</strong> Which categories of release you want to hear about.
        </li>
        <li>
          <strong>Notification tokens.</strong> An identifier for each browser or device that receives push notifications.
        </li>
        <li>
          <strong>Your plan.</strong> Free, Pro or Enterprise, and its expiry date. Release Scope has no checkout today, so we
          hold no payment details.
        </li>
        <li>
          <strong>Technical data.</strong> Like any web service, our host and error monitoring see technical details of requests,
          such as IP address, browser type and error traces.
        </li>
      </ul>

      <H2>How we use it</H2>
      <ul className={LI}>
        <li>To sign you in and keep your account secure.</li>
        <li>To show your feed and send the notifications you asked for.</li>
        <li>To apply your plan limits.</li>
        <li>To find and fix faults in the service.</li>
      </ul>
      <p className={`${P} mt-4`}>
        We do not sell your data, we do not show advertising, we do not use your data for advertising or profiling, and we do not
        use it to train AI models. Nobody at Release Scope reads your library except to fix a fault you report or to meet a legal
        duty.
      </p>

      <H2>Google user data</H2>
      <p className={P}>
        Release Scope&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a
          className="underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We use your Google name, email and picture only to run your account. We do not
        transfer them to anyone except the service providers listed below, and only so they can run Release Scope for us. You can
        revoke Release Scope&rsquo;s access at any time in your{" "}
        <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
          Google Account permissions
        </a>
        .
      </p>

      <H2>Who processes it</H2>
      <ul className={LI}>
        <li>
          <strong>Google Cloud and Firebase</strong> provide sign-in, our database and push notifications.
        </li>
        <li>
          <strong>Vercel</strong> serves the website and sees request data such as IP addresses.
        </li>
        <li>
          <strong>Sentry</strong> receives technical error reports from our servers.
        </li>
        <li>
          <strong>Google Gemini</strong> reads and summarises public changelogs. Your personal data and your library are never sent
          to it.
        </li>
      </ul>
      <p className={`${P} mt-4`}>
        These providers act on our instructions. We do not share personal data with anyone else unless the law requires it.
      </p>

      <H2>Cookies and local storage</H2>
      <p className={P}>
        We use only what the service needs: a sign-in session kept by Firebase in your browser, and a local copy of the public
        software catalogue so the page loads faster. We use no advertising or third-party tracking cookies.
      </p>

      <H2>How long we keep it</H2>
      <p className={P}>
        We keep your account data until you ask us to delete it. Short-lived operational records, such as background job records
        and the admin audit log, are deleted automatically after 30 to 400 days. Backups made by our database provider are
        overwritten on its normal schedule after deletion.
      </p>

      <H2>How we protect it</H2>
      <p className={P}>
        Data is encrypted in transit. Database rules limit each signed-in user to their own records, and only a small number of
        administrators can see account records, and only to run the service.
      </p>

      <H2>Your rights and deleting your data</H2>
      <p className={P}>
        You can see, correct or delete your data, and withdraw consent, at any time. Email{" "}
        <a className="underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>{" "}
        from the address on your account. We will delete your account record, library, settings and notification tokens, and
        reply within 30 days. If you are in the EU or UK you may also complain to your data protection authority.
      </p>

      <H2>Children</H2>
      <p className={P}>Release Scope is not aimed at children under 16 and we do not knowingly collect their data.</p>

      <H2>Changes</H2>
      <p className={P}>
        If we change how we handle data we will update this page and its date. If a change affects the Google data we request, we
        will tell signed-in users before it takes effect.
      </p>

      <H2>Contact</H2>
      <p className={P}>
        Questions about this policy:{" "}
        <a className="underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        .
      </p>
    </Page>
  );
}
