/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DT_SDK_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
