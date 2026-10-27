import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Read-only view of the pipeline's self-correction log.
 *
 * Writing is the poller's job (`backend/src/services/poller.ts`). The client
 * used to have `logLearning`/`autoCorrectSoftware` helpers that wrote
 * `master_registry` and `system_learnings` from the browser; the hardened rules
 * deny both, and keeping the functions would only turn a real bug into a
 * permission-denied toast.
 */

export type LearningType = "source_correction" | "metadata_improvement" | "pattern_recognition" | "error_fix";

export async function getRecentLearnings(max: number = 20) {
  const q = query(collection(db, "system_learnings"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
