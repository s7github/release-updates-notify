/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_DOMAIN?: string;
  readonly VITE_CATALOG_INDEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
