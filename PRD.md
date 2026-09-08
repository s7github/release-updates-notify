# UpdateNotify PWA PRD

## Overview
UpdateNotify is an intelligent software release tracker that uses AI to filter noise and deliver categorized, actionable updates.

## Core Features
1.  **Search-First Onboarding**: Users build their library by searching for software or topics (e.g., "Suno", "macOS").
2.  **Magic Discovery**: If a searched item is missing from the catalog, Gemini 1.5 Flash automatically discovers official update sources.
3.  **Unified Interests**: Software and plain-text topics are treated identically as items in the user's library.
4.  **Universal Polling**: 10-tier priority fallback system (GitHub -> Registries -> RSS -> HTML, etc.).
5.  **Smart Extraction**: Gemini extracts structured JSON from raw changelogs, including version, date, and category.

## Data Schema (Firestore)
-   `users`: Profiles and settings.
-   `interests`: Maps `userId` to `softwareId` or `topic`.
-   `master_registry`: Global catalog of software and sources.
-   `release_notes`: Structured updates processed by AI.
-   `admins`: Authorized admin UIDs.

## Technical Stack
-   **Frontend**: React 19, MUI v9, Tailwind CSS 4, Framer Motion.
-   **Backend**: Express 4 + Vite 6 (Full-stack proxy pattern).
-   **AI**: Gemini 1.5 Flash (@google/genai SDK) - Server-side for security.
-   **Database**: Firestore (Hardened Rules v2).
-   **Auth**: Firebase Google Auth.

## Implementation Status
- [x] **Universal Source Hierarchy**: Express-based proxy handles cross-origin fetching.
- [x] **Magic Discovery**: Frontend Gemini service discovers sources based on user queries.
- [x] **Smart Extraction**: Manual "Poll Now" triggers frontend Gemini extraction.
- [x] **Software Details & Timeline**: Comprehensive history view with version timeline and Markdown rendering.
- [x] **Enhanced Library Discovery**: Search results now include vendor, website links, and official icons.
- [x] **Instant Onboarding**: Automatically fetches latest release notes upon adding new software.
- [x] **Security**: Leveraging platform-managed Gemini keys via frontend SDK.
- [x] **UI Polish**: Fixed MUI v9 Autocomplete and layout refinements for search overlays.
- [x] **Admin Authority**: Registry Manager supports manual URL overrides and per-app priority tuning (RSS over GitHub, etc.).
- [x] **User Insights Directory**: Admin-only view of community tracking trends and topic demand.
- [x] **Responsive Timeline**: Dedicated product screen with sidebar history navigation (Desktop) and scrollable vertical feed (Mobile).
- [x] **Registry Control Center**: Admin panel with individual "Full Sync" (AI discovery + Poll) and batch onboarding functionality.
- [x] **Simplified Analytics**: High-density DataGrid view focused on status, sources, and update chronology.
- [x] **SSR and Performance Refinements**: Migrated high-frequency components from Stacks to standard Boxes to optimize rendering and fixed positional selector SSR warnings.
- [x] **Unified Follow Logic**: Streamlined notification toggles and library tracking into a consistent component pattern.
