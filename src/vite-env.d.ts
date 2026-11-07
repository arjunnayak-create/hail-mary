/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site URL, from .env (no trailing slash). */
  readonly VITE_SITE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
