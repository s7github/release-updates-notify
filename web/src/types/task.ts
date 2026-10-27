/** Shape of `background_tasks` documents, for display only. */
export type TaskType = "initial_poll" | "history_scrape" | "metadata_enrichment";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface BackgroundTask {
  id?: string;
  type: TaskType;
  status: TaskStatus;
  softwareId: string;
  softwareName: string;
  progress: number;
  message: string;
  error?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  details?: {
    sourceUrl?: string;
    foundCount?: number;
    samples?: unknown[];
    currentAction?: string;
    completedCount?: number;
    activePriority?: string[];
    settings?: {
      maxCount?: number;
      minDate?: string;
    };
  };
}
