/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  /** package.json's version, set in vite.config.ts. */
  readonly VITE_APP_VERSION?: string;
}
