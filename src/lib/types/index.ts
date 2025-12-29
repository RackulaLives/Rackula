/**
 * Rackula Core Type Definitions
 * Schema v1.0.0 - Flat structure with NetBox-compatible fields
 */

// =============================================================================
// Enums and Primitive Types
// =============================================================================

/**
 * Rack view types - front or rear view
 */
export type RackView = "front" | "rear";

/**
 * Device face types - which face(s) of rack device occupies
 */
export type DeviceFace = "front" | "rear" | "both";

/**
 * Device category types - 12 predefined categories
 */
export type DeviceCategory =
  | "server"
  | "network"
  | "patch-panel"
  | "power"
  | "storage"
  | "kvm"
  | "av-media"
  | "cooling"
  | "shelf"
  | "blank"
  | "cable-management"
  | "other";

/**
 * Weight unit types (NetBox-compatible)
 */
export type WeightUnit = "kg" | "lb";

/**
 * Rack form factor types (NetBox-compatible)
 */
export type FormFactor =
  | "2-post"
  | "4-post"
  | "4-post-cabinet"
  | "wall-mount"
  | "open-frame";

/**
 * Display mode for devices in rack visualization
 * - 'label': Show device name as text
 * - 'image': Show device image only
 * - 'image-label': Show device image with name overlay
 */
export type DisplayMode = "label" | "image" | "image-label";

/**
 * Airflow direction types (NetBox-compatible with full parity)
 */
export type Airflow =
  | "passive"
  | "front-to-rear"
  | "rear-to-front"
  | "left-to-right"
  | "right-to-left"
  | "side-to-rear"
  | "mixed";

/**
 * Subdevice role for parent/child device relationships
 */
export type SubdeviceRole = "parent" | "child";

// =============================================================================
// Component Types (NetBox-compatible, schema-only)
// =============================================================================

/**
 * Network interface definition
 */
export interface Interface {
  /** Interface name (e.g., 'eth0', 'Gi1/0/1') */
  name: string;
  /** Interface type (e.g., '1000base-t', '10gbase-x-sfpp') */
  type: string;
  /** Management interface only */
  mgmt_only?: boolean;
}

/**
 * Power port (input) definition
 */
export interface PowerPort {
  /** Port name (e.g., 'PSU1', 'Power Input') */
  name: string;
  /** Port type */
  type?: string;
  /** Maximum power draw in watts */
  maximum_draw?: number;
  /** Allocated power draw in watts */
  allocated_draw?: number;
}

/**
 * Power outlet (output) definition
 */
export interface PowerOutlet {
  /** Outlet name (e.g., 'Outlet 1', 'C13-1') */
  name: string;
  /** Outlet type */
  type?: string;
  /** Reference to PowerPort.name this outlet is fed from */
  power_port?: string;
  /** Feed leg for three-phase power */
  feed_leg?: "A" | "B" | "C";
}

/**
 * Device bay for parent devices (blade chassis, modular switches)
 */
export interface DeviceBay {
  /** Bay name (e.g., 'Blade Bay 1', 'Slot 1') */
  name: string;
  /** Bay position identifier */
  position?: string;
}

/**
 * Inventory item (internal components)
 */
export interface InventoryItem {
  /** Item name (e.g., 'RAM Module 1', 'CPU') */
  name: string;
  /** Item manufacturer */
  manufacturer?: string;
  /** Part ID / SKU */
  part_id?: string;
  /** Serial number */
  serial?: string;
  /** Asset tag */
  asset_tag?: string;
}

/**
 * External link/reference
 */
export interface DeviceLink {
  /** Link label (e.g., 'Vendor Manual', 'Support Page') */
  label: string;
  /** URL */
  url: string;
}

// =============================================================================
// Device Types (Storage/Serialization - Schema v1.0.0)
// =============================================================================

/**
 * Device Type - template definition in library (Storage format)
 * Schema v1.0.0: Flat structure with NetBox-compatible fields
 */
export interface DeviceType {
  // --- Core Identity ---
  /** Unique identifier, kebab-case slug */
  slug: string;
  /** Manufacturer name */
  manufacturer?: string;
  /** Model name */
  model?: string;
  /** Part number / SKU */
  part_number?: string;

  // --- Physical Properties ---
  /** Height in rack units (0.5-42U) */
  u_height: number;
  /** Whether device occupies full rack depth (default: true) */
  is_full_depth?: boolean;
  /** Whether device is powered (false for patch panels, shelves) */
  is_powered?: boolean;
  /** Device weight */
  weight?: number;
  /** Weight unit (required if weight is provided) */
  weight_unit?: WeightUnit;
  /** Airflow direction */
  airflow?: Airflow;

  // --- Image Flags ---
  /** Front image exists */
  front_image?: boolean;
  /** Rear image exists */
  rear_image?: boolean;

  // --- Rackula Fields (flat, not nested) ---
  /** Hex colour for display (e.g., '#4A90D9') */
  colour: string;
  /** Device category for UI filtering */
  category: DeviceCategory;
  /** User organization tags */
  tags?: string[];

  // --- Extension Fields ---
  /** Notes/comments */
  notes?: string;
  /** Serial number */
  serial_number?: string;
  /** Asset tag */
  asset_tag?: string;
  /** External links */
  links?: DeviceLink[];
  /** User-defined custom fields */
  custom_fields?: Record<string, unknown>;

  // --- Component Arrays (schema-only, future features) ---
  /** Network interfaces */
  interfaces?: Interface[];
  /** Power input ports */
  power_ports?: PowerPort[];
  /** Power output outlets (for PDUs) */
  power_outlets?: PowerOutlet[];
  /** Device bays (for blade chassis) */
  device_bays?: DeviceBay[];
  /** Inventory items (internal components) */
  inventory_items?: InventoryItem[];

  // --- Subdevice Support (schema-only) ---
  /** Role in parent/child relationship */
  subdevice_role?: SubdeviceRole;

  // --- Power Device Properties ---
  /** VA capacity (e.g., 1500, 3000) - for UPS devices */
  va_rating?: number;
}

/**
 * Placed device - storage format
 * References a DeviceType by slug
 */
export interface PlacedDevice {
  /** Unique identifier (UUID) for stable references */
  id: string;
  /** Reference to DeviceType.slug */
  device_type: string;
  /** Bottom U position (1-indexed, U1 is at the bottom) */
  position: number;
  /** Which face(s) of the rack the device occupies */
  face: DeviceFace;
  /** Optional custom display name for this placement */
  name?: string;

  // --- Placement Image Override ---
  /** Custom front image for this specific placement (overrides device type image) */
  front_image?: string;
  /** Custom rear image for this specific placement (overrides device type image) */
  rear_image?: string;

  // --- Placement Colour Override ---
  /** Custom colour for this specific placement (overrides device type colour) */
  colour_override?: string;

  // --- Subdevice Placement (schema-only) ---
  /** Parent placement ID (for child devices in bays) */
  parent_device?: string;
  /** Bay name in parent device */
  device_bay?: string;

  // --- Extension Fields ---
  /** Notes for this placement */
  notes?: string;
  /** User-defined custom fields */
  custom_fields?: Record<string, unknown>;
}

// =============================================================================
// Rack Types
// =============================================================================

/**
 * A rack unit container
 */
export interface Rack {
  /** Unique identifier (for multi-rack references) */
  id?: string;
  /** Display name */
  name: string;
  /** Height in rack units (1-100U) */
  height: number;
  /** Width in inches (10, 19, or 23) */
  width: 10 | 19 | 23;
  /** Descending units - if true, U1 is at top (default: false) */
  desc_units: boolean;
  /** Show rear view on canvas (default: true) */
  show_rear: boolean;
  /** Rack form factor */
  form_factor: FormFactor;
  /** Starting unit number (default: 1) */
  starting_unit: number;
  /** Order position (for future multi-rack) */
  position: number;
  /** Devices placed in this rack */
  devices: PlacedDevice[];
  /** Notes for this rack */
  notes?: string;
  /** Current view mode - runtime only, not persisted */
  view?: RackView;
}

// =============================================================================
// Layout Types
// =============================================================================

/**
 * Layout settings
 */
export interface LayoutSettings {
  /** Display mode for devices (default: label) */
  display_mode: DisplayMode;
  /** Show labels overlaid on device images (default: false) */
  show_labels_on_images: boolean;
}

/**
 * Complete layout structure
 */
export interface Layout {
  /** Schema version */
  version: string;
  /** Layout name */
  name: string;
  /** Single rack (Rackula is single-rack mode) */
  rack: Rack;
  /** Device type library */
  device_types: DeviceType[];
  /** Layout settings */
  settings: LayoutSettings;
}

// =============================================================================
// Helper Types for Creation
// =============================================================================

/**
 * Helper type for creating a DeviceType
 */
export interface CreateDeviceTypeData {
  name: string;
  u_height: number;
  category: DeviceCategory;
  colour: string;
  manufacturer?: string;
  model?: string;
  part_number?: string;
  is_full_depth?: boolean;
  is_powered?: boolean;
  weight?: number;
  weight_unit?: WeightUnit;
  airflow?: Airflow;
  tags?: string[];
  notes?: string;
  // Power device properties
  va_rating?: number;
}

/**
 * Helper type for creating a rack
 */
export interface CreateRackData {
  name: string;
  height: number;
  width?: 10 | 19 | 23;
  form_factor?: FormFactor;
  desc_units?: boolean;
  starting_unit?: number;
}

// =============================================================================
// Export Types
// =============================================================================

/**
 * Export format options
 */
export type ExportFormat = "png" | "jpeg" | "svg" | "pdf" | "csv";

/**
 * Export scope options
 */
export type ExportScope = "all" | "selected";

/**
 * Export background options
 */
export type ExportBackground = "dark" | "light" | "transparent";

/**
 * Export view options - which rack face(s) to include
 */
export type ExportView = "front" | "rear" | "both";

/**
 * Export options for generating images/files
 */
export interface ExportOptions {
  /** Output format */
  format: ExportFormat;
  /** Which racks to include */
  scope: ExportScope;
  /** Include rack names in export */
  includeNames: boolean;
  /** Include device legend */
  includeLegend: boolean;
  /** Background style */
  background: ExportBackground;
  /** Which view(s) to export */
  exportView?: ExportView;
  /** Display mode */
  displayMode?: DisplayMode;
  /** Include sharing QR code in export */
  includeQR?: boolean;
  /** Pre-generated QR code as PNG data URL (required when includeQR is true) */
  qrCodeDataUrl?: string;
}
