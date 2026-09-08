import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type TaskType = 'initial_poll' | 'history_scrape' | 'metadata_enrichment';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BackgroundTask {
  id?: string;
  type: TaskType;
  status: TaskStatus;
  softwareId: string;
  softwareName: string;
  progress: number; // 0 to 100
  message: string;
  error?: string;
  createdAt: any;
  updatedAt: any;
  details?: {
    sourceUrl?: string;
    foundCount?: number;
    samples?: any[];
    currentAction?: string;
    completedCount?: number;
    activePriority?: string[];
    settings?: {
      maxCount?: number;
      minDate?: string;
    };
  };
}

export const createTask = async (type: TaskType, softwareId: string, softwareName: string) => {
  const taskRef = await addDoc(collection(db, "background_tasks"), {
    type,
    status: 'pending',
    softwareId,
    softwareName,
    progress: 0,
    message: 'Task queued',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return taskRef.id;
};

export const updateTask = async (taskId: string, updates: Partial<BackgroundTask>) => {
  const taskRef = doc(db, "background_tasks", taskId);
  await updateDoc(taskRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
};
