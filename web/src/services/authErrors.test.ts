import { describe, expect, it, vi } from "vitest";
import { describeAuthError, showAuthNotice } from "./authErrors";

const err = (code: string) => Object.assign(new Error(`Firebase: raw text (${code}).`), { code });

describe("describeAuthError", () => {
  it.each(["auth/user-cancelled", "auth/popup-closed-by-user", "auth/cancelled-popup-request"])(
    "treats %s as a quiet cancellation",
    (code) => {
      const notice = describeAuthError(err(code));
      expect(notice.kind).toBe("quiet");
      expect(notice.text).not.toMatch(/firebase|auth\/|idp/i);
    },
  );

  it("explains a blocked popup", () => {
    expect(describeAuthError(err("auth/popup-blocked"))).toEqual({
      kind: "error",
      text: "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    });
  });

  it("never leaks the raw message for unknown errors", () => {
    const notice = describeAuthError(err("auth/something-new"));
    expect(notice.kind).toBe("error");
    expect(notice.text).toBe("We couldn't sign you in. Please try again.");
  });

  it("handles non-error values", () => {
    expect(describeAuthError(undefined).kind).toBe("error");
    expect(describeAuthError("boom").kind).toBe("error");
  });

  it("does not mention Firebase or Google Cloud project ids for the domain error", () => {
    const notice = describeAuthError(err("auth/unauthorized-domain"));
    expect(notice.text).not.toMatch(/firebase|gen-lang|console/i);
  });
});

describe("showAuthNotice", () => {
  const makeToast = () => Object.assign(vi.fn(), { error: vi.fn() });

  it("uses the neutral toast for cancellations", () => {
    const toast = makeToast();
    showAuthNotice(err("auth/user-cancelled"), toast, vi.fn());
    expect(toast).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("uses the error toast and logs the raw error for real failures", () => {
    const toast = makeToast();
    const log = vi.fn();
    const e = err("auth/internal-error");
    showAuthNotice(e, toast, log);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("Sign-in failed", e);
  });
});
