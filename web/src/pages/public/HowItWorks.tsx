import { Link } from "react-router-dom";
import Page, { H1, H2 } from "./Page";

const FLOW = ["You follow", "We watch the changelog", "You get told"];

export default function HowItWorks() {
  return (
    <Page path="/how-it-works">
      <H1>How Release Scope works</H1>
      <p className="mt-4 max-w-2xl text-lg text-white/70">
        You choose the software. We do the reading. Nothing runs in your browser except the app itself.
      </p>

      <figure className="mt-8">
        <svg viewBox="0 0 720 110" role="img" aria-labelledby="flow-title" className="w-full">
          <title id="flow-title">Follow software, we watch its changelog, you get a notification</title>
          {FLOW.map((label, i) => (
            <g key={label} transform={`translate(${i * 250 + 10} 15)`}>
              <rect width="220" height="80" rx="16" fill="#111" stroke="#F27D26" strokeOpacity="0.5" />
              <text x="110" y="46" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">
                {label}
              </text>
              {i < 2 && <path d="M226 40h18m-6-6 6 6-6 6" stroke="#F27D26" strokeWidth="2" fill="none" />}
            </g>
          ))}
        </svg>
      </figure>

      <H2>Step by step</H2>
      <ol className="list-decimal space-y-3 pl-6 text-white/80">
        <li>
          <strong>Follow.</strong> Search the catalogue and follow what you use. If something is missing, ask us to find its
          changelog.
        </li>
        <li>
          <strong>We watch.</strong> A server checks each source on a schedule. Pages that have not changed are skipped, and
          structured sources such as GitHub, npm and PyPI are compared by version number.
        </li>
        <li>
          <strong>You are told.</strong> A new release appears in your feed with a short summary and a category: security, new
          feature, bug fix or major release.
        </li>
      </ol>

      <H2>Follow or mute</H2>
      <p className="max-w-2xl text-white/75">
        A followed item notifies you. You can also keep an item in your library without notifications, and mute whole
        categories such as bug fixes. Major releases are always sent.
      </p>

      <H2>Plan limits</H2>
      <p className="max-w-2xl text-white/75">
        Free follows up to 5 items with a 30-day history. Pro and Enterprise are unlimited.{" "}
        <Link to="/pricing" className="text-primary underline">
          Compare plans
        </Link>
        .
      </p>
    </Page>
  );
}
