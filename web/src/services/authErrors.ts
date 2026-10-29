/**
 * Sign-in errors, in words a user can act on. The raw Firebase message is never
 * shown (it names the stack and ends in a code like "(auth/user-cancelled)");
 * it goes to the console for us instead.
 */
export type AuthNotice =
  | { kind: "quiet"; text: string } // the user chose to stop; not an error
  | { kind: "error"; text: string };

const CANCELLED = new Set([
  "auth/user-cancelled",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

function codeOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "";
}

export function describeAuthError(error: unknown): AuthNotice {
  const code = codeOf(error);
  if (CANCELLED.has(code)) {
    return { kind: "quiet", text: "Sign-in cancelled. You can try again whenever you're ready." };
  }
  switch (code) {
    case "auth/popup-blocked":
      return { kind: "error", text: "Your browser blocked the sign-in window. Allow pop-ups for this site and try again." };
    case "auth/network-request-failed":
      return { kind: "error", text: "Network problem while signing in. Check your connection and try again." };
    case "auth/too-many-requests":
      return { kind: "error", text: "Too many sign-in attempts. Wait a moment and try again." };
    case "auth/unauthorized-domain":
      return { kind: "error", text: "Sign-in isn't available from this address. Open the app from its main website and try again." };
    default:
      return { kind: "error", text: "We couldn't sign you in. Please try again." };
  }
}

type Toast = { (message: string): unknown; error: (message: string) => unknown };

/** Show the right toast for a sign-in failure. `toast` and `log` are injected so this stays testable. */
export function showAuthNotice(
  error: unknown,
  toast: Toast,
  log: (...args: unknown[]) => void = console.warn,
): void {
  const notice = describeAuthError(error);
  if (notice.kind === "quiet") {
    toast(notice.text);
    return;
  }
  log("Sign-in failed", error);
  toast.error(notice.text);
}
