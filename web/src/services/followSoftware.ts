import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface FollowTarget {
  id: string;
  name: string;
}

export type FollowResult = { ok: true } | { ok: false; reason: "exists" };

/**
 * Follow a catalog software entry. Deterministic id: a repeated follow is an
 * idempotent no-op, not a duplicate notification (docs/DATA_MODEL.md section 2).
 * Tier limits are the caller's job. Firestore errors propagate to the caller.
 */
export async function followSoftware(uid: string, hit: FollowTarget): Promise<FollowResult> {
  const ref = doc(db, "interests", `${uid}_${hit.id}`);
  if ((await getDoc(ref)).exists()) return { ok: false, reason: "exists" };

  await setDoc(ref, {
    userId: uid,
    softwareId: hit.id,
    topic: null,
    softwareName: hit.name,
    type: "software",
    following: true,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}
