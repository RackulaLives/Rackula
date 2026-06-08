/// <reference types="vite/client" />
// vite-env.d.ts
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;
declare const __BRANCH_NAME__: string;
declare const __GIT_DIRTY__: boolean;
declare const __BUILD_ENV__: string;
// Note: __PERSIST_ENABLED__ removed - API availability is now detected at runtime
