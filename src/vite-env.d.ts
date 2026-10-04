/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_RT_MSGS_PER_SEC?: string;
  readonly VITE_FR_DEBUG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
