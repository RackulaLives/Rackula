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

// Vite build-time constants
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;
declare const __BRANCH_NAME__: string;
declare const __GIT_DIRTY__: boolean;

// Runtime deployment config injected via /config.js
// CROSS-REF: static/config.js, deploy/docker-entrypoint-wrapper.sh
declare global {
  interface Window {
    __RACKULA_CONFIG__?: {
      storage?: string;
      env?: string;
    };
  }
}

export {};
