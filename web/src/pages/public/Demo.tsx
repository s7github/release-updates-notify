import { DEMO_RELEASES } from "../../seo/demoData";
import { usePublicActions } from "../../seo/PublicActions";
import Page, { H1 } from "./Page";

const CATEGORY_STYLE: Record<string, string> = {
  Security: "bg-red-500/15 text-red-300",
  "New feature": "bg-emerald-500/15 text-emerald-300",
  "Bug fix": "bg-sky-500/15 text-sky-300",
  "Major release": "bg-primary/20 text-primary",
};

export default function Demo() {
  const { signIn, signingIn } = usePublicActions();
  return (
    <Page path="/demo">
      <H1>What your feed looks like</H1>
      <p role="note" className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
        This is sample data. Sign in to follow your own software.
      </p>
      <ul className="mt-6 space-y-4">
        {DEMO_RELEASES.map((r) => (
          <li key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-bold">
                {r.product} <span className="font-normal text-white/60">{r.version}</span>
              </p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${CATEGORY_STYLE[r.category]}`}>{r.category}</span>
            </div>
            <p className="mt-2 text-white/75">{r.summary}</p>
            <p className="mt-2 text-xs text-white/50">{r.date} · sample release</p>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <button
          type="button"
          onClick={signIn}
          disabled={signingIn}
          className="rounded-full bg-primary px-7 py-3 font-bold text-black disabled:opacity-60"
        >
          Get started free
        </button>
      </div>
    </Page>
  );
}
