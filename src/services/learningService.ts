import { collection, addDoc, updateDoc, doc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";

export type LearningType = "source_correction" | "metadata_improvement" | "pattern_recognition" | "error_fix";

interface LearningEntry {
  type: LearningType;
  softwareId?: string;
  softwareName?: string;
  description: string;
  previousValue?: string;
  newValue?: string;
  impact: string;
  confidence: number;
  applied: boolean;
}

export async function logLearning(entry: LearningEntry) {
  try {
    const learningsRef = collection(db, "system_learnings");
    const data = {
      ...entry,
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(learningsRef, data);
    
    // If it's a high-confidence correction and applied is false, maybe we should apply it?
    // Actually, in this app, we'll apply first then log, or log the application.
    return docRef.id;
  } catch (error) {
    console.error("Failed to log learning:", error);
  }
}

/**
 * Automatically improves software metadata based on polling results
 */
export async function autoCorrectSoftware(softwareId: string, currentData: any, newData: any) {
  const changes: string[] = [];
  const updates: any = {};

  // Example: Learning a better RSS feed
  if (newData.rss_url && newData.rss_url !== currentData.rss_url) {
    updates.rss_url = newData.rss_url;
    changes.push(`Updated RSS Feed: ${currentData.rss_url || 'None'} -> ${newData.rss_url}`);
  }

  // Example: Learning a more accurate vendor name
  if (newData.vendor && newData.vendor !== currentData.vendor) {
    updates.vendor = newData.vendor;
    changes.push(`Corrected Vendor: ${currentData.vendor || 'None'} -> ${newData.vendor}`);
  }

  // Example: Finding a missing changelog URL
  if (newData.changelog_url && newData.changelog_url !== currentData.changelog_url) {
    updates.changelog_url = newData.changelog_url;
    changes.push(`Discovered Changelog URL: ${newData.changelog_url}`);
  }

  if (changes.length > 0) {
    try {
      await updateDoc(doc(db, "master_registry", softwareId), updates);
      
      await logLearning({
        type: "source_correction",
        softwareId,
        softwareName: currentData.name,
        description: `Automatic correction of metadata based on successful data extraction.`,
        previousValue: JSON.stringify(currentData),
        newValue: JSON.stringify(updates),
        impact: `Improved accuracy for ${changes.join(", ")}`,
        confidence: 0.9,
        applied: true
      });
      
      return true;
    } catch (e) {
      console.error("Auto-correction failed:", e);
    }
  }
  return false;
}

export async function getRecentLearnings(max: number = 20) {
  const q = query(collection(db, "system_learnings"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
