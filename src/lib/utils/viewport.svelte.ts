/**
 * Viewport Utility
 * Mobile/desktop viewport detection with reactive state
 */

const MOBILE_BREAKPOINT = '(max-width: 1024px)';

// Module-level state (using $state rune)
let isMobileViewport = $state(false);
let viewportWidth = $state(0);

// Track if store has been initialized
let isInitialized = false;
let hasResizeListener = false;
let mediaQuery: MediaQueryList | null = null;
let mediaQueryChangeHandler: ((event: MediaQueryListEvent) => void) | null = null;

function updateViewportSnapshot(): void {
	if (typeof window === 'undefined') return;
	isMobileViewport = window.matchMedia(MOBILE_BREAKPOINT).matches;
	viewportWidth = window.innerWidth;
}

function teardownViewportListeners(): void {
	if (mediaQuery && mediaQueryChangeHandler) {
		mediaQuery.removeEventListener('change', mediaQueryChangeHandler);
	}
	if (typeof window !== 'undefined' && hasResizeListener) {
		window.removeEventListener('resize', updateViewportSnapshot);
	}
	mediaQuery = null;
	mediaQueryChangeHandler = null;
	hasResizeListener = false;
	isInitialized = false;
}

/**
 * Check if current viewport is mobile (<= 1024px)
 * @returns True if viewport is mobile size
 */
export function isMobile(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia(MOBILE_BREAKPOINT).matches;
}

/**
 * Initialize viewport detection with reactive state
 * Call this once at app startup to enable reactivity
 */
export function initViewport(): void {
	getViewportStore();
}

/**
 * Reset viewport store state (for testing)
 */
export function resetViewportStore(): void {
	teardownViewportListeners();
	isMobileViewport = false;
	viewportWidth = 0;
}

/**
 * Explicit cleanup for listener teardown (e.g. tests/teardown hooks).
 */
export function destroyViewportStore(): void {
	teardownViewportListeners();
}

/**
 * Get viewport store with reactive state
 * @returns Store object with isMobile getter
 */
export function getViewportStore() {
	// Initialize on first access if not already done
	if (typeof window !== 'undefined' && !isInitialized) {
		mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);
		updateViewportSnapshot();

		mediaQueryChangeHandler = (event: MediaQueryListEvent) => {
			isMobileViewport = event.matches;
			updateViewportSnapshot();
		};

		mediaQuery.addEventListener('change', mediaQueryChangeHandler);
		if (!hasResizeListener) {
			window.addEventListener('resize', updateViewportSnapshot, {
				passive: true
			});
			hasResizeListener = true;
		}
		isInitialized = true;
	}

	return {
		get isMobile() {
			return isMobileViewport;
		},
		get width() {
			return viewportWidth;
		}
	};
}
