import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../../brand";
import { usePublicActions } from "../../seo/PublicActions";

const NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/demo", label: "Demo" },
  { to: "/pricing", label: "Pricing" },
];

export function Wordmark() {
  return (
    <Link to="/" aria-label={`${BRAND.name} home`} className="text-xl tracking-tight text-white no-underline">
      <span className="font-normal">{BRAND.wordmark.light}</span>
      <span className="font-extrabold text-primary">{BRAND.wordmark.bold}</span>
    </Link>
  );
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { signedIn, signIn, signingIn } = usePublicActions();
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      {!signedIn && (
        <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5">
          <Wordmark />
          <nav aria-label="Main" className="flex items-center gap-4 whitespace-nowrap text-sm sm:gap-6">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`text-white/70 no-underline hover:text-white ${n.to === "/pricing" ? "" : "hidden sm:inline"}`}
              >
                {n.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={signIn}
              disabled={signingIn}
              className="rounded-full bg-primary px-4 py-2 font-semibold text-black disabled:opacity-60"
            >
              Sign in
            </button>
          </nav>
        </header>
      )}
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        {children}
      </main>
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-white/60">
          <p>© {BRAND.name}</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link to="/privacy" className="text-white/60 hover:text-white">Privacy</Link>
            <Link to="/terms" className="text-white/60 hover:text-white">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
