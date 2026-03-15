/**
 * Device Type Commands for Undo/Redo
 */

import type { Command } from './types';
import type { DeviceType, PlacedDevice } from '$lib/types';
import { getImageStore } from '../images.svelte';
import type { DeviceImageData } from '$lib/types/images';

/**
 * Interface for layout store operations needed by device type commands
 */
export interface DeviceTypeCommandStore {
	addDeviceTypeRaw(deviceType: DeviceType): void;
	removeDeviceTypeRaw(slug: string): void;
	updateDeviceTypeRaw(slug: string, updates: Partial<DeviceType>): void;
	placeDeviceRaw(device: PlacedDevice): number;
	removeDeviceAtIndexRaw(index: number): void;
	getPlacedDevicesForType(slug: string): PlacedDevice[];
	setActiveRackId(id: string | null): void;
	getActiveRackId(): string | null;
}

/**
 * Create a command to add a device type
 */
export function createAddDeviceTypeCommand(
	deviceType: DeviceType,
	store: DeviceTypeCommandStore
): Command {
	return {
		type: 'ADD_DEVICE_TYPE',
		description: `Add ${deviceType.model ?? deviceType.slug}`,
		timestamp: Date.now(),
		execute() {
			store.addDeviceTypeRaw(deviceType);
		},
		undo() {
			store.removeDeviceTypeRaw(deviceType.slug);
		}
	};
}

/**
 * Create a command to update a device type
 */
export function createUpdateDeviceTypeCommand(
	slug: string,
	before: Partial<DeviceType>,
	after: Partial<DeviceType>,
	store: DeviceTypeCommandStore
): Command {
	return {
		type: 'UPDATE_DEVICE_TYPE',
		description: `Update ${slug}`,
		timestamp: Date.now(),
		execute() {
			store.updateDeviceTypeRaw(slug, after);
		},
		undo() {
			store.updateDeviceTypeRaw(slug, before);
		}
	};
}

/**
 * Create a command to delete a device type (including placed instances)
 * Accepts rack-aware device data so undo restores devices to their original racks.
 */
export function createDeleteDeviceTypeCommand(
	deviceType: DeviceType,
	placedDevices: { rackId: string; device: PlacedDevice }[],
	store: DeviceTypeCommandStore
): Command {
	const deviceData = placedDevices.map((d) => ({
		rackId: d.rackId,
		device: JSON.parse(JSON.stringify(d.device)) as PlacedDevice,
	}));
	const deviceTypeCopy = JSON.parse(JSON.stringify(deviceType)) as DeviceType;

	// Snapshot all images associated with this device type
	const imageStore = getImageStore();
	const typeImageSnapshot = imageStore.getAllImages().get(deviceType.slug);
	const typeImageCopy = typeImageSnapshot ? structuredClone(typeImageSnapshot) : undefined;

	// Snapshot placement-specific images for each placed device
	const placementSnapshots = new Map<string, DeviceImageData>();
	for (const d of placedDevices) {
		const key = `placement-${d.device.id}`;
		const snap = imageStore.getAllImages().get(key);
		if (snap) placementSnapshots.set(key, structuredClone(snap));
	}

	return {
		type: 'DELETE_DEVICE_TYPE',
		description: `Delete ${deviceType.model ?? deviceType.slug}`,
		timestamp: Date.now(),
		execute() {
			// Clean up images (moved from raw mutator)
			const imgStore = getImageStore();
			imgStore.removeAllDeviceImages(deviceTypeCopy.slug);
			for (const key of placementSnapshots.keys()) {
				imgStore.removeAllDeviceImages(key);
			}
			store.removeDeviceTypeRaw(deviceTypeCopy.slug);
		},
		undo() {
			store.addDeviceTypeRaw(deviceTypeCopy);
			// Restore devices to their original racks
			const previousActiveRack = store.getActiveRackId();
			for (const { rackId, device } of deviceData) {
				store.setActiveRackId(rackId);
				store.placeDeviceRaw(device);
			}
			store.setActiveRackId(previousActiveRack);
			// Restore images
			const imgStore = getImageStore();
			if (typeImageCopy) {
				if (typeImageCopy.front) imgStore.setDeviceImage(deviceTypeCopy.slug, 'front', typeImageCopy.front);
				if (typeImageCopy.rear) imgStore.setDeviceImage(deviceTypeCopy.slug, 'rear', typeImageCopy.rear);
			}
			for (const [key, snap] of placementSnapshots) {
				if (snap.front) imgStore.setDeviceImage(key, 'front', snap.front);
				if (snap.rear) imgStore.setDeviceImage(key, 'rear', snap.rear);
			}
		}
	};
}
