import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initAnalytics, trackEvent, isAnalyticsEnabled, analytics } from '$lib/utils/analytics';

describe('analytics', () => {
	beforeEach(() => {
		// Reset module state by re-importing would be ideal, but for now
		// we test the public API behavior
		vi.stubGlobal('__UMAMI_ENABLED__', false);
		vi.stubGlobal('__APP_VERSION__', '0.5.7');
		vi.stubGlobal('__UMAMI_SCRIPT_URL__', '');
		vi.stubGlobal('__UMAMI_WEBSITE_ID__', '');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('isAnalyticsEnabled', () => {
		it('returns false when umami is not loaded', () => {
			expect(isAnalyticsEnabled()).toBe(false);
		});

		it('returns false when disabled via config', () => {
			vi.stubGlobal('__UMAMI_ENABLED__', false);
			expect(isAnalyticsEnabled()).toBe(false);
		});
	});

	describe('initAnalytics', () => {
		it('does not throw when called', () => {
			expect(() => initAnalytics()).not.toThrow();
		});

		it('can be called multiple times safely', () => {
			expect(() => {
				initAnalytics();
				initAnalytics();
				initAnalytics();
			}).not.toThrow();
		});
	});

	describe('trackEvent', () => {
		it('does not throw when analytics disabled', () => {
			expect(() => trackEvent('file:save', { device_count: 5 })).not.toThrow();
		});

		it('does not throw with empty properties', () => {
			expect(() => trackEvent('export:csv', {})).not.toThrow();
		});
	});

	describe('analytics convenience functions', () => {
		it('trackSave does not throw', () => {
			expect(() => analytics.trackSave(10)).not.toThrow();
		});

		it('trackLoad does not throw', () => {
			expect(() => analytics.trackLoad(5)).not.toThrow();
		});

		it('trackExportImage does not throw', () => {
			expect(() => analytics.trackExportImage('png', 'both')).not.toThrow();
		});

		it('trackExportPDF does not throw', () => {
			expect(() => analytics.trackExportPDF('front')).not.toThrow();
		});

		it('trackExportCSV does not throw', () => {
			expect(() => analytics.trackExportCSV()).not.toThrow();
		});

		it('trackDevicePlace does not throw', () => {
			expect(() => analytics.trackDevicePlace('server')).not.toThrow();
		});

		it('trackCustomDeviceCreate does not throw', () => {
			expect(() => analytics.trackCustomDeviceCreate('network')).not.toThrow();
		});

		it('trackDisplayModeToggle does not throw', () => {
			expect(() => analytics.trackDisplayModeToggle('image')).not.toThrow();
		});

		it('trackRackResize does not throw', () => {
			expect(() => analytics.trackRackResize(42)).not.toThrow();
		});

		it('trackKeyboardShortcut does not throw', () => {
			expect(() => analytics.trackKeyboardShortcut('Ctrl+S')).not.toThrow();
		});

		// Tier 1: Core feature adoption events
		it('trackRackCreate does not throw', () => {
			expect(() => analytics.trackRackCreate()).not.toThrow();
		});

		it('trackPanelOpen does not throw for all panel types', () => {
			expect(() => analytics.trackPanelOpen('help')).not.toThrow();
			expect(() => analytics.trackPanelOpen('export')).not.toThrow();
			expect(() => analytics.trackPanelOpen('share')).not.toThrow();
		});

		it('trackPanelClose does not throw for all panel types', () => {
			expect(() => analytics.trackPanelClose('help')).not.toThrow();
			expect(() => analytics.trackPanelClose('export')).not.toThrow();
			expect(() => analytics.trackPanelClose('share')).not.toThrow();
		});

		it('trackToolbarClick does not throw for all button types', () => {
			expect(() => analytics.trackToolbarClick('new-rack')).not.toThrow();
			expect(() => analytics.trackToolbarClick('undo')).not.toThrow();
			expect(() => analytics.trackToolbarClick('redo')).not.toThrow();
			expect(() => analytics.trackToolbarClick('delete')).not.toThrow();
			expect(() => analytics.trackToolbarClick('fit-all')).not.toThrow();
			expect(() => analytics.trackToolbarClick('theme')).not.toThrow();
			expect(() => analytics.trackToolbarClick('hamburger')).not.toThrow();
		});

		it('trackPaletteImport does not throw', () => {
			expect(() => analytics.trackPaletteImport()).not.toThrow();
		});

		it('trackMobileFabClick does not throw', () => {
			expect(() => analytics.trackMobileFabClick()).not.toThrow();
		});
	});
});

describe('heartbeat tracking', () => {
	const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
	const ACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes

	// Test the heartbeat logic in isolation using direct interval simulation
	// The actual integration is tested manually since module state management
	// with fake timers and dynamic imports is complex

	it('heartbeat interval logic - sends when active', () => {
		vi.useFakeTimers();

		const mockTrack = vi.fn();
		const sessionStart = Date.now();
		let lastActivity = Date.now();

		// Simulate the heartbeat interval callback logic
		const heartbeatCallback = () => {
			const now = Date.now();
			const timeSinceActivity = now - lastActivity;
			if (timeSinceActivity < ACTIVITY_TIMEOUT) {
				const sessionMinutes = Math.round((now - sessionStart) / 60000);
				mockTrack('session:heartbeat', { session_minutes: sessionMinutes });
			}
		};

		// Set up interval
		const intervalId = setInterval(heartbeatCallback, HEARTBEAT_INTERVAL);

		// Advance most of the way, then simulate activity, then advance the rest
		// This simulates a user who was active within the last 2 minutes
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - 60000); // 4 minutes
		lastActivity = Date.now(); // User active at 4 min mark
		vi.advanceTimersByTime(60000); // Final 1 minute

		expect(mockTrack).toHaveBeenCalledWith('session:heartbeat', { session_minutes: 5 });

		clearInterval(intervalId);
		vi.useRealTimers();
	});

	it('heartbeat interval logic - skips when idle', () => {
		vi.useFakeTimers();

		const mockTrack = vi.fn();
		const sessionStart = Date.now();
		const lastActivity = Date.now(); // Never updated - simulates idle user

		const heartbeatCallback = () => {
			const now = Date.now();
			const timeSinceActivity = now - lastActivity;
			if (timeSinceActivity < ACTIVITY_TIMEOUT) {
				const sessionMinutes = Math.round((now - sessionStart) / 60000);
				mockTrack('session:heartbeat', { session_minutes: sessionMinutes });
			}
		};

		const intervalId = setInterval(heartbeatCallback, HEARTBEAT_INTERVAL);

		// User was active initially, but then goes idle
		// Advance past activity timeout without updating lastActivity
		vi.advanceTimersByTime(ACTIVITY_TIMEOUT + 1000);

		// Now advance to heartbeat time
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - ACTIVITY_TIMEOUT - 1000);

		// Should NOT have called track because user was idle
		expect(mockTrack).not.toHaveBeenCalled();

		clearInterval(intervalId);
		vi.useRealTimers();
	});

	it('heartbeat interval logic - resumes after activity', () => {
		vi.useFakeTimers();

		const mockTrack = vi.fn();
		const sessionStart = Date.now();
		let lastActivity = Date.now();

		const heartbeatCallback = () => {
			const now = Date.now();
			const timeSinceActivity = now - lastActivity;
			if (timeSinceActivity < ACTIVITY_TIMEOUT) {
				const sessionMinutes = Math.round((now - sessionStart) / 60000);
				mockTrack('session:heartbeat', { session_minutes: sessionMinutes });
			}
		};

		const intervalId = setInterval(heartbeatCallback, HEARTBEAT_INTERVAL);

		// First heartbeat - user is active (activity at 4 min)
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - 60000);
		lastActivity = Date.now();
		vi.advanceTimersByTime(60000);
		expect(mockTrack).toHaveBeenCalledWith('session:heartbeat', { session_minutes: 5 });
		mockTrack.mockClear();

		// User goes idle for longer than timeout - no activity update
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL);
		expect(mockTrack).not.toHaveBeenCalled(); // Idle, no heartbeat

		// User becomes active again (at 14 min mark)
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - 60000);
		lastActivity = Date.now();
		mockTrack.mockClear();

		// Next heartbeat should fire at 15 min
		vi.advanceTimersByTime(60000);
		expect(mockTrack).toHaveBeenCalledWith('session:heartbeat', { session_minutes: 15 });

		clearInterval(intervalId);
		vi.useRealTimers();
	});

	it('heartbeat interval logic - increments session time correctly', () => {
		vi.useFakeTimers();

		const mockTrack = vi.fn();
		const sessionStart = Date.now();
		let lastActivity = Date.now();

		const heartbeatCallback = () => {
			const now = Date.now();
			const timeSinceActivity = now - lastActivity;
			if (timeSinceActivity < ACTIVITY_TIMEOUT) {
				const sessionMinutes = Math.round((now - sessionStart) / 60000);
				mockTrack('session:heartbeat', { session_minutes: sessionMinutes });
			}
		};

		const intervalId = setInterval(heartbeatCallback, HEARTBEAT_INTERVAL);

		// First heartbeat at 5 min - activity at 4 min
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - 60000);
		lastActivity = Date.now();
		vi.advanceTimersByTime(60000);
		expect(mockTrack).toHaveBeenLastCalledWith('session:heartbeat', { session_minutes: 5 });

		// Second heartbeat at 10 min - activity at 9 min
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - 60000);
		lastActivity = Date.now();
		vi.advanceTimersByTime(60000);
		expect(mockTrack).toHaveBeenLastCalledWith('session:heartbeat', { session_minutes: 10 });

		// Third heartbeat at 15 min - activity at 14 min
		vi.advanceTimersByTime(HEARTBEAT_INTERVAL - 60000);
		lastActivity = Date.now();
		vi.advanceTimersByTime(60000);
		expect(mockTrack).toHaveBeenLastCalledWith('session:heartbeat', { session_minutes: 15 });

		clearInterval(intervalId);
		vi.useRealTimers();
	});

	it('activity events update lastActivity timestamp', () => {
		// Test that the activity tracking pattern works
		let lastActivity = 0;
		const updateActivity = () => {
			lastActivity = Date.now();
		};

		// Simulate event listener pattern
		expect(lastActivity).toBe(0);

		// Simulate pointerdown
		updateActivity();
		expect(lastActivity).toBeGreaterThan(0);
		const firstActivity = lastActivity;

		// Small delay and another event
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		updateActivity();
		expect(lastActivity).toBeGreaterThan(firstActivity);
		vi.useRealTimers();
	});
});
