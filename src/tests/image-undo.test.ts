/**
 * Image Undo Tests
 *
 * Verifies that images are properly snapshotted at command creation time
 * and restored when undoing device removal or device type deletion.
 * Bug #1477: Images were cleaned up in raw mutators (called during undo),
 * so undoing a removal lost the images permanently.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getImageStore, resetImageStore } from '$lib/stores/images.svelte';
import { createRemoveDeviceCommand } from '$lib/stores/commands/device';
import { createDeleteDeviceTypeCommand } from '$lib/stores/commands/device-type';
import type { DeviceCommandStore } from '$lib/stores/commands/device';
import type { DeviceTypeCommandStore } from '$lib/stores/commands/device-type';
import { createTestDevice, createTestDeviceType } from './factories';
import type { PlacedDevice, DeviceType } from '$lib/types';
import type { ImageData } from '$lib/types/images';

// Helper to create mock ImageData (user upload)
function createMockImageData(filename = 'test-front.png'): ImageData {
	return {
		blob: new Blob(['test'], { type: 'image/png' }),
		dataUrl: 'data:image/png;base64,dGVzdA==',
		filename
	};
}

// Minimal mock store that tracks placed devices
function createMockDeviceStore(devices: PlacedDevice[]): DeviceCommandStore {
	return {
		placeDeviceRaw(device: PlacedDevice) {
			devices.push(device);
			return devices.length - 1;
		},
		removeDeviceAtIndexRaw(index: number) {
			const removed = devices[index];
			devices.splice(index, 1);
			return removed;
		},
		moveDeviceRaw() { return true; },
		updateDeviceFaceRaw() {},
		updateDeviceNameRaw() {},
		updateDevicePlacementImageRaw() {},
		updateDeviceColourRaw() {},
		updateDeviceSlotPositionRaw() {},
		updateDeviceNotesRaw() {},
		updateDeviceIpRaw() {},
		getDeviceAtIndex(index: number) { return devices[index]; },
	};
}

// Minimal mock store for device type commands
function createMockDeviceTypeStore(
	deviceTypes: DeviceType[],
	devices: PlacedDevice[]
): DeviceTypeCommandStore {
	let activeRackId: string | null = null;
	return {
		addDeviceTypeRaw(dt: DeviceType) {
			deviceTypes.push(dt);
		},
		removeDeviceTypeRaw(slug: string) {
			const idx = deviceTypes.findIndex((dt) => dt.slug === slug);
			if (idx >= 0) deviceTypes.splice(idx, 1);
			// Also remove placed devices of this type
			for (let i = devices.length - 1; i >= 0; i--) {
				if (devices[i].device_type === slug) devices.splice(i, 1);
			}
		},
		updateDeviceTypeRaw() {},
		placeDeviceRaw(device: PlacedDevice) {
			devices.push(device);
			return devices.length - 1;
		},
		removeDeviceAtIndexRaw() {},
		getPlacedDevicesForType(slug: string) {
			return devices.filter((d) => d.device_type === slug);
		},
		getDeviceAtIndex(index: number) { return devices[index]; },
		setActiveRackId(id: string | null) { activeRackId = id; },
		getActiveRackId() { return activeRackId; },
	};
}

describe('Image Undo — Device Removal', () => {
	beforeEach(() => {
		resetImageStore();
	});

	it('removing device with placement image then undoing restores image', () => {
		const imageStore = getImageStore();
		const device = createTestDevice({ id: 'dev-1', device_type: 'test-device' });
		const devices = [device];
		const store = createMockDeviceStore(devices);

		// Set up a placement image for this device
		const imageKey = `placement-${device.id}`;
		const frontImage = createMockImageData('dev-1-front.png');
		imageStore.setDeviceImage(imageKey, 'front', frontImage);

		// Verify image exists before removal
		expect(imageStore.hasImage(imageKey, 'front')).toBe(true);

		// Create the remove command (should snapshot images)
		const cmd = createRemoveDeviceCommand(0, device, store, 'Test Device');

		// Execute: removes device and cleans up images
		cmd.execute();
		expect(imageStore.hasImage(imageKey, 'front')).toBe(false);

		// Undo: should restore the device AND its images
		cmd.undo();
		expect(imageStore.hasImage(imageKey, 'front')).toBe(true);
		expect(imageStore.getDeviceImage(imageKey, 'front')?.filename).toBe('dev-1-front.png');
	});

	it('removing device with both front and rear images restores both on undo', () => {
		const imageStore = getImageStore();
		const device = createTestDevice({ id: 'dev-2', device_type: 'test-device' });
		const devices = [device];
		const store = createMockDeviceStore(devices);

		const imageKey = `placement-${device.id}`;
		imageStore.setDeviceImage(imageKey, 'front', createMockImageData('dev-2-front.png'));
		imageStore.setDeviceImage(imageKey, 'rear', createMockImageData('dev-2-rear.png'));

		const cmd = createRemoveDeviceCommand(0, device, store, 'Test Device');

		cmd.execute();
		expect(imageStore.hasImage(imageKey, 'front')).toBe(false);
		expect(imageStore.hasImage(imageKey, 'rear')).toBe(false);

		cmd.undo();
		expect(imageStore.hasImage(imageKey, 'front')).toBe(true);
		expect(imageStore.hasImage(imageKey, 'rear')).toBe(true);
		expect(imageStore.getDeviceImage(imageKey, 'front')?.filename).toBe('dev-2-front.png');
		expect(imageStore.getDeviceImage(imageKey, 'rear')?.filename).toBe('dev-2-rear.png');
	});

	it('removing device without images does not fail on undo', () => {
		const device = createTestDevice({ id: 'dev-3', device_type: 'test-device' });
		const devices = [device];
		const store = createMockDeviceStore(devices);

		const cmd = createRemoveDeviceCommand(0, device, store, 'Test Device');

		cmd.execute();
		// Should not throw
		expect(() => cmd.undo()).not.toThrow();
	});
});

describe('Image Undo — Device Type Deletion', () => {
	beforeEach(() => {
		resetImageStore();
	});

	it('deleting device type with images then undoing restores all images', () => {
		const imageStore = getImageStore();
		const deviceType = createTestDeviceType({ slug: 'my-server', u_height: 2 });
		const device1 = createTestDevice({ id: 'placed-1', device_type: 'my-server' });
		const device2 = createTestDevice({ id: 'placed-2', device_type: 'my-server' });

		const deviceTypes = [deviceType];
		const devices = [device1, device2];
		const store = createMockDeviceTypeStore(deviceTypes, devices);

		// Set up type-level image
		imageStore.setDeviceImage('my-server', 'front', createMockImageData('my-server-front.png'));

		// Set up placement-specific images
		imageStore.setDeviceImage('placement-placed-1', 'front', createMockImageData('placed-1-front.png'));
		imageStore.setDeviceImage('placement-placed-2', 'rear', createMockImageData('placed-2-rear.png'));

		const cmd = createDeleteDeviceTypeCommand(deviceType, [
			{ rackId: 'rack-1', device: device1 },
			{ rackId: 'rack-1', device: device2 },
		], store);

		// Execute: deletes type, devices, and images
		cmd.execute();
		expect(imageStore.hasImage('my-server', 'front')).toBe(false);
		expect(imageStore.hasImage('placement-placed-1', 'front')).toBe(false);
		expect(imageStore.hasImage('placement-placed-2', 'rear')).toBe(false);

		// Undo: should restore everything
		cmd.undo();
		expect(imageStore.hasImage('my-server', 'front')).toBe(true);
		expect(imageStore.getDeviceImage('my-server', 'front')?.filename).toBe('my-server-front.png');
		expect(imageStore.hasImage('placement-placed-1', 'front')).toBe(true);
		expect(imageStore.getDeviceImage('placement-placed-1', 'front')?.filename).toBe('placed-1-front.png');
		expect(imageStore.hasImage('placement-placed-2', 'rear')).toBe(true);
		expect(imageStore.getDeviceImage('placement-placed-2', 'rear')?.filename).toBe('placed-2-rear.png');
	});

	it('deleting device type without images does not fail on undo', () => {
		const deviceType = createTestDeviceType({ slug: 'no-image-device' });
		const deviceTypes = [deviceType];
		const devices: PlacedDevice[] = [];
		const store = createMockDeviceTypeStore(deviceTypes, devices);

		const cmd = createDeleteDeviceTypeCommand(deviceType, [], store);

		cmd.execute();
		expect(() => cmd.undo()).not.toThrow();
	});
});
