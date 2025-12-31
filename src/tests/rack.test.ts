import { describe, it, expect } from 'vitest';
import {
	createRack,
	validateRack,
	getOccupiedUs,
	isUAvailable,
	duplicateRack
} from '$lib/utils/rack';
import type { DeviceType, Rack } from '$lib/types';

// Helper to create test devices
function createTestDevice(slug: string, u_height: number): DeviceType {
	return {
		slug,
		model: `Test Device ${slug}`,
		u_height,
		colour: '#4A90D9',
		category: 'server'
	};
}

// Helper to create mock racks for testing
function createMockRack(overrides: Partial<Rack> = {}): Rack {
	return {
		name: 'Test Rack',
		height: 42,
		width: 19,
		position: 0,
		desc_units: false,
		form_factor: '4-post',
		starting_unit: 1,
		devices: [],
		...overrides
	};
}

describe('Rack Utilities', () => {
	describe('createRack', () => {
		it('creates rack with provided name', () => {
			const rack = createRack('Test Rack', 42);
			expect(rack.name).toBe('Test Rack');
		});

		it('sets default width to 19', () => {
			const rack = createRack('Test Rack', 42);
			expect(rack.width).toBe(19);
		});

		it('creates rack with explicit width 19', () => {
			const rack = createRack('Test Rack', 42, undefined, 19);
			expect(rack.width).toBe(19);
		});

		it('creates rack with width 10', () => {
			const rack = createRack('Test Rack', 42, undefined, 10);
			expect(rack.width).toBe(10);
		});

		it('sets position to 0', () => {
			const rack = createRack('Test Rack', 42);
			expect(rack.position).toBe(0);
		});

		it('initializes empty devices array', () => {
			const rack = createRack('Test Rack', 42);
			expect(rack.devices).toEqual([]);
		});

		it('preserves provided name and height', () => {
			const rack = createRack('Main Rack', 24);
			expect(rack.name).toBe('Main Rack');
			expect(rack.height).toBe(24);
		});

		it('sets default form_factor to 4-post-cabinet', () => {
			const rack = createRack('Test', 42);
			expect(rack.form_factor).toBe('4-post-cabinet');
		});

		it('sets default desc_units to false', () => {
			const rack = createRack('Test', 42);
			expect(rack.desc_units).toBe(false);
		});

		it('sets default starting_unit to 1', () => {
			const rack = createRack('Test', 42);
			expect(rack.starting_unit).toBe(1);
		});
	});

	describe('validateRack', () => {
		it('returns valid:true for valid rack', () => {
			const rack: Rack = {
				name: 'Main Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('rejects height less than 1', () => {
			const rack: Rack = {
				name: 'Main Rack',
				height: 0,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Height must be between 1 and 100');
		});

		it('rejects height greater than 100', () => {
			const rack: Rack = {
				name: 'Main Rack',
				height: 101,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Height must be between 1 and 100');
		});

		it('rejects empty name', () => {
			const rack: Rack = {
				name: '',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Name is required');
		});

		it('accepts width of 10', () => {
			const rack: Rack = {
				name: 'Main Rack',
				height: 42,
				width: 10,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(true);
		});

		it('accepts width of 19', () => {
			const rack: Rack = {
				name: 'Main Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(true);
		});

		it('rejects invalid width', () => {
			const rack = {
				name: 'Main Rack',
				height: 42,
				width: 15 as 10 | 19 | 21 | 23, // Force type for test - use 15 which is invalid
				position: 0,
				desc_units: false,
				form_factor: '4-post' as const,
				starting_unit: 1,
				devices: []
			};

			const result = validateRack(rack);
			expect(result.valid).toBe(false);
			// Schema v1.0.0: 10, 19, 21, and 23 are valid widths
			expect(result.errors).toContain('Width must be 10, 19, 21, or 23 inches');
		});
	});

	describe('getOccupiedUs', () => {
		it('returns empty Set for empty rack', () => {
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			const deviceLibrary: DeviceType[] = [];
			const occupied = getOccupiedUs(rack, deviceLibrary);
			expect(occupied.size).toBe(0);
		});

		it('returns correct Us for 1U device at position 5', () => {
			const device = createTestDevice('device-1', 1);
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: [{ id: 'rack-test-1', device_type: 'device-1', position: 5, face: 'front' }]
			};

			const occupied = getOccupiedUs(rack, [device]);
			expect(occupied.size).toBe(1);
			expect(occupied.has(5)).toBe(true);
		});

		it('returns correct Us for 2U device at position 5 (5,6)', () => {
			const device = createTestDevice('device-1', 2);
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: [{ id: 'rack-test-2', device_type: 'device-1', position: 5, face: 'front' }]
			};

			const occupied = getOccupiedUs(rack, [device]);
			expect(occupied.size).toBe(2);
			expect(occupied.has(5)).toBe(true);
			expect(occupied.has(6)).toBe(true);
		});

		it('returns correct Us for 4U device at position 10 (10,11,12,13)', () => {
			const device = createTestDevice('device-1', 4);
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: [{ id: 'rack-test-3', device_type: 'device-1', position: 10, face: 'front' }]
			};

			const occupied = getOccupiedUs(rack, [device]);
			expect(occupied.size).toBe(4);
			expect(occupied.has(10)).toBe(true);
			expect(occupied.has(11)).toBe(true);
			expect(occupied.has(12)).toBe(true);
			expect(occupied.has(13)).toBe(true);
		});

		it('combines multiple devices correctly', () => {
			const device1 = createTestDevice('device-1', 2);
			const device2 = createTestDevice('device-2', 1);
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: [
					{ id: 'rack-test-4', device_type: 'device-1', position: 1, face: 'front' },
					{ id: 'rack-test-5', device_type: 'device-2', position: 10, face: 'front' }
				]
			};

			const occupied = getOccupiedUs(rack, [device1, device2]);
			expect(occupied.size).toBe(3);
			expect(occupied.has(1)).toBe(true);
			expect(occupied.has(2)).toBe(true);
			expect(occupied.has(10)).toBe(true);
		});
	});

	describe('isUAvailable', () => {
		it('returns true for empty rack', () => {
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: []
			};

			expect(isUAvailable(rack, [], 1)).toBe(true);
			expect(isUAvailable(rack, [], 42)).toBe(true);
		});

		it('returns false for occupied U', () => {
			const device = createTestDevice('device-1', 2);
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: [{ id: 'rack-test-6', device_type: 'device-1', position: 5, face: 'front' }]
			};

			expect(isUAvailable(rack, [device], 5)).toBe(false);
			expect(isUAvailable(rack, [device], 6)).toBe(false);
		});

		it('returns true for unoccupied U', () => {
			const device = createTestDevice('device-1', 2);
			const rack: Rack = {
				name: 'Test Rack',
				height: 42,
				width: 19,
				position: 0,
				desc_units: false,
				form_factor: '4-post',
				starting_unit: 1,
				devices: [{ id: 'rack-test-7', device_type: 'device-1', position: 5, face: 'front' }]
			};

			expect(isUAvailable(rack, [device], 1)).toBe(true);
			expect(isUAvailable(rack, [device], 4)).toBe(true);
			expect(isUAvailable(rack, [device], 7)).toBe(true);
		});
	});

	describe('duplicateRack', () => {
		it('creates new rack as a copy', () => {
			const original = createMockRack({ name: 'Original Rack' });
			const copy = duplicateRack(original);
			expect(copy).not.toBe(original);
		});

		it('appends (Copy) to name', () => {
			const original = createMockRack({ name: 'Main Rack' });
			const copy = duplicateRack(original);
			expect(copy.name).toBe('Main Rack (Copy)');
		});

		it('preserves rack properties', () => {
			const original = createMockRack({ height: 42, form_factor: '2-post' });
			const copy = duplicateRack(original);
			expect(copy.height).toBe(42);
			expect(copy.form_factor).toBe('2-post');
		});

		it('copies all devices preserving positions and faces', () => {
			const original = createMockRack({
				devices: [
					{ id: 'rack-dup-1', device_type: 'lib-1', position: 1, face: 'front' },
					{ id: 'rack-dup-2', device_type: 'lib-2', position: 10, face: 'both' }
				]
			});
			const copy = duplicateRack(original);
			expect(copy.devices).toHaveLength(2);
			expect(copy.devices[0]?.position).toBe(1);
			expect(copy.devices[1]?.face).toBe('both');
		});

		it('positions copy after original', () => {
			const original = createMockRack({ position: 2 });
			const copy = duplicateRack(original);
			expect(copy.position).toBe(3);
		});
	});
});
