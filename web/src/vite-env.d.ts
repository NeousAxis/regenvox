/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAQUETTE?: string
  readonly VITE_API_CONSULTATION?: string
  readonly VITE_API_IA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
