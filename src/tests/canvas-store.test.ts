import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getCanvasStore,
	resetCanvasStore,
	ZOOM_MIN,
	ZOOM_MAX,
	ZOOM_STEP
} from '$lib/stores/canvas.svelte';

// Mock panzoom instance
function createMockPanzoom(initialScale = 1) {
	let transform = { x: 0, y: 0, scale: initialScale };
	const listeners: Record<string, Array<() => void>> = {};

	const mock = {
		getTransform: () => ({ ...transform }),
		zoomAbs: vi.fn((x: number, y: number, scale: number) => {
			transform = { x, y, scale };
			listeners['zoom']?.forEach((cb) => cb());
		}),
		smoothZoomAbs: vi.fn((x: number, y: number, scale: number) => {
			transform = { x, y, scale };
			listeners['zoom']?.forEach((cb) => cb());
		}),
		moveTo: vi.fn((x: number, y: number) => {
			transform.x = x;
			transform.y = y;
		}),
		on: vi.fn((event: string, callback: () => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(callback);
		}),
		dispose: vi.fn()
	};

	return mock as typeof mock & ReturnType<typeof import('panzoom').default>;
}

describe('Canvas Store', () => {
	beforeEach(() => {
		resetCanvasStore();
	});

	describe('initial state', () => {
		it('starts with zoom at 1 (100%)', () => {
			const store = getCanvasStore();
			expect(store.zoom).toBe(1);
		});

		it('starts with zoomPercentage at 100', () => {
			const store = getCanvasStore();
			expect(store.zoomPercentage).toBe(100);
		});

		it('starts with no panzoom instance', () => {
			const store = getCanvasStore();
			expect(store.hasPanzoom).toBe(false);
		});

		it('can zoom in from initial state', () => {
			const store = getCanvasStore();
			expect(store.canZoomIn).toBe(true);
		});

		it('can zoom out from initial state', () => {
			const store = getCanvasStore();
			expect(store.canZoomOut).toBe(true);
		});
	});

	describe('setPanzoomInstance', () => {
		it('sets hasPanzoom to true', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom();

			store.setPanzoomInstance(mockPanzoom);

			expect(store.hasPanzoom).toBe(true);
		});

		it('syncs zoom from panzoom instance', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1.5);

			store.setPanzoomInstance(mockPanzoom);

			expect(store.zoom).toBe(1.5);
			expect(store.zoomPercentage).toBe(150);
		});

		it('registers zoom event listener', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom();

			store.setPanzoomInstance(mockPanzoom);

			expect(mockPanzoom.on).toHaveBeenCalledWith('zoom', expect.any(Function));
		});
	});

	describe('disposePanzoom', () => {
		it('disposes panzoom instance', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom();

			store.setPanzoomInstance(mockPanzoom);
			store.disposePanzoom();

			expect(mockPanzoom.dispose).toHaveBeenCalled();
			expect(store.hasPanzoom).toBe(false);
		});
	});

	describe('zoomIn', () => {
		it('does nothing without panzoom instance', () => {
			const store = getCanvasStore();
			const initialZoom = store.zoom;

			store.zoomIn();

			expect(store.zoom).toBe(initialZoom);
		});

		it('increases zoom by ZOOM_STEP', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.zoomIn();

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1 + ZOOM_STEP);
		});

		it('does not exceed ZOOM_MAX', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(ZOOM_MAX);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.zoomIn();

			expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
		});

		it('clamps to ZOOM_MAX when approaching limit', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(ZOOM_MAX - 0.1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.zoomIn();

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MAX);
		});
	});

	describe('zoomOut', () => {
		it('does nothing without panzoom instance', () => {
			const store = getCanvasStore();
			const initialZoom = store.zoom;

			store.zoomOut();

			expect(store.zoom).toBe(initialZoom);
		});

		it('decreases zoom by ZOOM_STEP', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.zoomOut();

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1 - ZOOM_STEP);
		});

		it('does not go below ZOOM_MIN', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(ZOOM_MIN);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.zoomOut();

			expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
		});

		it('clamps to ZOOM_MIN when approaching limit', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(ZOOM_MIN + 0.1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.zoomOut();

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MIN);
		});
	});

	describe('setZoom', () => {
		it('sets zoom to specific value', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.setZoom(1.5);

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
		});

		it('clamps to ZOOM_MIN', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.setZoom(0.1);

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MIN);
		});

		it('clamps to ZOOM_MAX', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.setZoom(5);

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, ZOOM_MAX);
		});
	});

	describe('resetZoom', () => {
		it('resets zoom to 1 and position to origin', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1.5);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.resetZoom();

			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1);
			expect(mockPanzoom.moveTo).toHaveBeenCalledWith(0, 0);
		});
	});

	describe('getTransform', () => {
		it('returns default transform without panzoom', () => {
			const store = getCanvasStore();
			const transform = store.getTransform();

			expect(transform).toEqual({ x: 0, y: 0, scale: 1 });
		});

		it('returns panzoom transform when available', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1.5);
			// Manually set transform
			mockPanzoom.moveTo(100, 200);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			const transform = store.getTransform();

			expect(transform.scale).toBe(1.5);
		});
	});

	describe('canZoomIn/canZoomOut', () => {
		it('canZoomIn is false at ZOOM_MAX', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(ZOOM_MAX);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);

			expect(store.canZoomIn).toBe(false);
		});

		it('canZoomOut is false at ZOOM_MIN', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(ZOOM_MIN);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);

			expect(store.canZoomOut).toBe(false);
		});
	});

	describe('smoothMoveTo', () => {
		it('zooms at origin then moves when reduced motion not preferred', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			// Mock matchMedia to return false for reduced motion
			vi.stubGlobal(
				'matchMedia',
				vi.fn(() => ({ matches: false }))
			);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.smoothMoveTo(100, 200, 1.5);

			// Should zoom at origin (0, 0) to avoid coordinate confusion
			expect(mockPanzoom.smoothZoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
			// Note: moveTo is called async via setTimeout, so we can't test it here easily

			vi.unstubAllGlobals();
		});

		it('zooms at origin then moves when reduced motion preferred', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			// Mock matchMedia to return true for reduced motion
			vi.stubGlobal(
				'matchMedia',
				vi.fn(() => ({ matches: true }))
			);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.smoothMoveTo(100, 200, 1.5);

			// Should zoom at origin (0, 0) then apply pan offset
			expect(mockPanzoom.zoomAbs).toHaveBeenCalledWith(0, 0, 1.5);
			expect(mockPanzoom.moveTo).toHaveBeenCalledWith(100, 200);

			vi.unstubAllGlobals();
		});
	});

	describe('zoom event sync', () => {
		it('updates zoom when panzoom emits zoom event', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);

			// Simulate zoom change via zoomAbs (which triggers the zoom event)
			mockPanzoom.zoomAbs(0, 0, 1.75);

			expect(store.zoom).toBe(1.75);
			expect(store.zoomPercentage).toBe(175);
		});
	});

	describe('fitAll', () => {
		it('fitAll function is callable', () => {
			const store = getCanvasStore();

			// fitAll should be a function on the store
			expect(typeof store.fitAll).toBe('function');
		});

		it('fitAll does nothing without panzoom instance', () => {
			const store = getCanvasStore();
			const initialZoom = store.zoom;

			// Should not throw when called without panzoom
			store.fitAll([]);

			expect(store.zoom).toBe(initialZoom);
		});

		it('fitAll does nothing when canvas element is cleared', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);
			store.setCanvasElement(null);

			const mockRacks = [
				{
					name: 'Test',
					height: 42,
					width: 19 as const,
					position: 0,
					desc_units: false,
					form_factor: '4-post' as const,
					starting_unit: 1,
					devices: []
				}
			] as Parameters<typeof store.fitAll>[0];

			store.fitAll(mockRacks);

			expect(mockPanzoom.zoomAbs).not.toHaveBeenCalled();
			expect(mockPanzoom.moveTo).not.toHaveBeenCalled();
		});

		it('fitAll centers rack in viewport when panzoom is available', () => {
			const store = getCanvasStore();
			const mockPanzoom = createMockPanzoom(1);

			// Mock matchMedia for reduced motion check
			vi.stubGlobal(
				'matchMedia',
				vi.fn(() => ({ matches: false }))
			);

			// Mock canvas element for viewport dimensions
			const mockCanvas = document.createElement('div');
			Object.defineProperty(mockCanvas, 'clientWidth', { value: 800 });
			Object.defineProperty(mockCanvas, 'clientHeight', { value: 600 });

			store.setCanvasElement(mockCanvas);
			store.setPanzoomInstance(mockPanzoom as ReturnType<typeof import('panzoom').default>);

			// Call fitAll with mock rack data
			const mockRacks = [
				{
					name: 'Test',
					height: 42,
					width: 19 as const,
					position: 0,
					desc_units: false,
					form_factor: '4-post' as const,
					starting_unit: 1,
					devices: []
				}
			] as Parameters<typeof store.fitAll>[0];

			store.fitAll(mockRacks);

			// Should call zoomAbs and moveTo to center the content
			expect(mockPanzoom.zoomAbs).toHaveBeenCalled();
			expect(mockPanzoom.moveTo).toHaveBeenCalled();

			vi.unstubAllGlobals();
		});
	});
});
