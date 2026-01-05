/**
 * Application Type Declarations
 *
 * Custom type declarations for Vite asset imports
 */

// WebP image imports
declare module "*.webp" {
  const src: string;
  export default src;
}

// PNG image imports
declare module "*.png" {
  const src: string;
  export default src;
}

// JPEG image imports
declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.jpeg" {
  const src: string;
  export default src;
}

// Umami Analytics types
/// <reference types="umami-browser" />

declare global {
  interface Window {
    umami?: umami.umami;
  }
}

// Vite build-time constants
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;
declare const __BRANCH_NAME__: string;
declare const __GIT_DIRTY__: boolean;
declare const __UMAMI_ENABLED__: boolean;
declare const __UMAMI_SCRIPT_URL__: string;
declare const __UMAMI_WEBSITE_ID__: string;

export {};
