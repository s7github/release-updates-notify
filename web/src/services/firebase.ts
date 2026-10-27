import { initializeApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/**
 * Sign in without assuming a popup is available.
 *
 * Popups are blocked in plenty of real situations — embedded webviews, strict
 * browser settings, a user who clicked too fast. Falling back to a full-page
 * redirect keeps sign-in working instead of leaving a dead button.
 */
export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      // A blocked popup is not something the user can fix mid-click; a redirect
      // is the path that still works. `getRedirectResult` in App finishes it.
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
};

/** Complete a redirect sign-in started by the fallback above. */
export async function completeRedirectSignIn(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (error) {
    // The caller already has an auth listener; surface a readable message.
    throw error;
  }
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "auth/unauthorized-domain":
      return "This domain is not authorised for Google sign-in yet. Add it in Firebase Auth → Settings → Authorized domains.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
    case "auth/network-request-failed":
      return "Network problem while signing in. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Wait a moment and try again.";
    default:
      return error instanceof Error ? error.message : "Sign-in failed. Please try again.";
  }
}

// Connection test as per critical constraint
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
