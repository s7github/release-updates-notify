/**
 * Removed: clients do not create or advance `background_tasks`.
 *
 * Letting a browser write task progress means letting it lie about pipeline
 * state (ADR-0006). The API creates tasks when it enqueues work; the UI reads
 * them and displays them. The display-only type lives in `src/types/task.ts`.
 */
export {};
