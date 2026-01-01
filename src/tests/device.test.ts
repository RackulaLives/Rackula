import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateId, getDefaultColour, getDeviceDisplayName } from '$lib/utils/device';
import { CATEGORY_COLOURS } from '$lib/types/constants';
import type { DeviceCategory, DeviceType, PlacedDevice } from '$lib/types';

describe('Device Utilities', () => {
	describe('generateId', () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('returns valid UUID v4 format', () => {
			const id = generateId();
			// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
		});

		it('returns unique values on successive calls', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateId());
			}
			expect(ids.size).toBe(100);
		});

		it('uses fallback when crypto.randomUUID is not available', () => {
			// Mock crypto.randomUUID to be undefined (simulating older browsers)
			const originalRandomUUID = crypto.randomUUID;
			Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });

			try {
				const id = generateId();
				// Should still return valid UUID v4 format from fallback
				expect(id).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
				);
			} finally {
				// Restore original function
				Object.defineProperty(crypto, 'randomUUID', {
					value: originalRandomUUID,
					configurable: true
				});
			}
		});

		it('fallback generates unique values', () => {
			const originalRandomUUID = crypto.randomUUID;
			Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });

			try {
				const ids = new Set<string>();
				for (let i = 0; i < 100; i++) {
					ids.add(generateId());
				}
				expect(ids.size).toBe(100);
			} finally {
				Object.defineProperty(crypto, 'randomUUID', {
					value: originalRandomUUID,
					configurable: true
				});
			}
		});
	});

	describe('getDefaultColour', () => {
		it('returns muted cyan for server', () => {
			expect(getDefaultColour('server')).toBe('#4A7A8A');
		});

		it('returns muted purple for network', () => {
			expect(getDefaultColour('network')).toBe('#7B6BA8');
		});

		it('returns correct colour for each category', () => {
			const categories: DeviceCategory[] = [
				'server',
				'network',
				'patch-panel',
				'power',
				'storage',
				'kvm',
				'av-media',
				'cooling',
				'shelf',
				'blank',
				'other'
			];

			categories.forEach((category) => {
				const colour = getDefaultColour(category);
				expect(colour).toBe(CATEGORY_COLOURS[category]);
			});
		});
	});

	describe('getDeviceDisplayName', () => {
		// Helper to create minimal PlacedDevice
		const createPlacedDevice = (overrides: Partial<PlacedDevice> = {}): PlacedDevice => ({
			id: 'test-id',
			device_type: 'test-device',
			position: 1,
			rack_id: 'rack-1',
			...overrides
		});

		// Helper to create minimal DeviceType
		const createDeviceType = (overrides: Partial<DeviceType> = {}): DeviceType => ({
			slug: 'test-device',
			u_height: 1,
			category: 'server',
			...overrides
		});

		it('returns placement name when available', () => {
			const placed = createPlacedDevice({ name: 'My Server' });
			const library: DeviceType[] = [createDeviceType({ model: 'DL380 Gen10' })];

			expect(getDeviceDisplayName(placed, library)).toBe('My Server');
		});

		it('falls back to device type model when no placement name', () => {
			const placed = createPlacedDevice({ name: undefined });
			const library: DeviceType[] = [createDeviceType({ model: 'DL380 Gen10' })];

			expect(getDeviceDisplayName(placed, library)).toBe('DL380 Gen10');
		});

		it('falls back to manufacturer when no name or model', () => {
			const placed = createPlacedDevice({ name: undefined });
			const library: DeviceType[] = [
				createDeviceType({ model: undefined, manufacturer: 'HPE' })
			];

			expect(getDeviceDisplayName(placed, library)).toBe('HPE');
		});

		it('falls back to slug when no name, model, or manufacturer', () => {
			const placed = createPlacedDevice({
				name: undefined,
				device_type: 'custom-switch'
			});
			const library: DeviceType[] = [
				createDeviceType({
					slug: 'custom-switch',
					model: undefined,
					manufacturer: undefined
				})
			];

			expect(getDeviceDisplayName(placed, library)).toBe('custom-switch');
		});

		it('returns slug when device type not found in library', () => {
			const placed = createPlacedDevice({
				name: undefined,
				device_type: 'unknown-device'
			});
			const library: DeviceType[] = [createDeviceType({ slug: 'other-device' })];

			expect(getDeviceDisplayName(placed, library)).toBe('unknown-device');
		});

		it('prioritizes placement name over device type properties', () => {
			const placed = createPlacedDevice({
				name: 'Production DB',
				device_type: 'dl380-gen10'
			});
			const library: DeviceType[] = [
				createDeviceType({
					slug: 'dl380-gen10',
					model: 'DL380 Gen10',
					manufacturer: 'HPE'
				})
			];

			expect(getDeviceDisplayName(placed, library)).toBe('Production DB');
		});

		it('prioritizes model over manufacturer', () => {
			const placed = createPlacedDevice({ name: undefined });
			const library: DeviceType[] = [
				createDeviceType({
					model: 'USW-Pro-48-PoE',
					manufacturer: 'Ubiquiti'
				})
			];

			expect(getDeviceDisplayName(placed, library)).toBe('USW-Pro-48-PoE');
		});

		it('handles empty library', () => {
			const placed = createPlacedDevice({
				name: undefined,
				device_type: 'orphaned-device'
			});

			expect(getDeviceDisplayName(placed, [])).toBe('orphaned-device');
		});

		it('handles empty string name (treats as no name)', () => {
			const placed = createPlacedDevice({ name: '' });
			const library: DeviceType[] = [createDeviceType({ model: 'Model X' })];

			// Empty string is falsy, so should fall back to model
			expect(getDeviceDisplayName(placed, library)).toBe('Model X');
		});
	});
});
