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
 * Annotation field for rack-side annotation column
 * - 'name': Custom placement name
 * - 'ip': IP address from custom_fields.ip
 * - 'notes': Placement notes
 * - 'asset_tag': Asset identifier (from DeviceType)
 * - 'serial': Serial number (from DeviceType)
 * - 'manufacturer': Brand name (from DeviceType)
 */
export type AnnotationField =
  | "name"
  | "ip"
  | "notes"
  | "asset_tag"
  | "serial"
  | "manufacturer";

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

/**
 * Slot position for half-width devices
 * - 'left': Device occupies left half of rack width
 * - 'right': Device occupies right half of rack width
 * - 'full': Device occupies full rack width (default)
 */
export type SlotPosition = "left" | "right" | "full";

/**
 * Slot width for device types
 * - 1: Half-width device (occupies one slot)
 * - 2: Full-width device (occupies both slots, default)
 */
export type SlotWidth = 1 | 2;

/**
 * Network interface type (NetBox-compatible subset)
 * Common physical interface types for rack equipment
 */
export type InterfaceType =
  // Copper Ethernet
  | "100base-tx" // 100 Mbps RJ45
  | "1000base-t" // 1 GbE RJ45
  | "2.5gbase-t" // 2.5 GbE RJ45
  | "5gbase-t" // 5 GbE RJ45
  | "10gbase-t" // 10 GbE RJ45
  // Modular - SFP/SFP+/SFP28
  | "1000base-x-sfp" // 1 GbE SFP
  | "10gbase-x-sfpp" // 10 GbE SFP+
  | "25gbase-x-sfp28" // 25 GbE SFP28
  // Modular - QSFP/QSFP28/QSFP-DD
  | "40gbase-x-qsfpp" // 40 GbE QSFP+
  | "100gbase-x-qsfp28" // 100 GbE QSFP28
  | "100gbase-x-qsfpdd" // 100 GbE QSFP-DD
  | "200gbase-x-qsfp56" // 200 GbE QSFP56
  | "200gbase-x-qsfpdd" // 200 GbE QSFP-DD
  | "400gbase-x-qsfpdd" // 400 GbE QSFP-DD
  // Console & Management
  | "console" // Console port (RJ45/USB)
  | "usb-a" // USB Type A
  | "usb-b" // USB Type B
  | "usb-c" // USB Type C
  | "usb-mini-b" // USB Mini B
  | "usb-micro-b" // USB Micro B
  // Virtual
  | "virtual" // Virtual interface
  | "lag" // Link Aggregation Group
  // Other
  | "other"; // Catch-all for unlisted types

/**
 * PoE type (NetBox-compatible)
 * Power over Ethernet standards
 */
export type PoEType =
  | "type1-ieee802.3af" // 15.4W max
  | "type2-ieee802.3at" // 30W max (PoE+)
  | "type3-ieee802.3bt" // 60W max (PoE++ 4-pair)
  | "type4-ieee802.3bt" // 100W max (PoE++ 4-pair)
  | "passive-24v-1pair" // Passive 24V (1-pair)
  | "passive-24v-2pair" // Passive 24V (2-pair)
  | "passive-48v-1pair" // Passive 48V (1-pair)
  | "passive-48v-2pair" // Passive 48V (2-pair)
  | "passive-56v-4pair"; // Passive 56V (4-pair, Ubiquiti)

/**
 * PoE mode - powered device or power sourcing equipment
 */
export type PoEMode = "pd" | "pse";

/**
 * Interface position on device face
 */
export type InterfacePosition = "front" | "rear";

/**
 * Cable type (NetBox-compatible)
 * Physical cable types for network, fiber, and power connections
 */
export type CableType =
  // Copper Ethernet
  | "cat5e"
  | "cat6"
  | "cat6a"
  | "cat7"
  | "cat8"
  // Direct Attach Copper
  | "dac-passive"
  | "dac-active"
  // Fiber - Multi-mode
  | "mmf-om3"
  | "mmf-om4"
  // Fiber - Single-mode
  | "smf-os2"
  // Active Optical Cable
  | "aoc"
  // Power & Serial
  | "power"
  | "serial";

/**
 * Cable status (NetBox-compatible)
 */
export type CableStatus = "connected" | "planned" | "decommissioning";

/**
 * Length unit for cable measurements
 */
export type LengthUnit = "m" | "cm" | "ft" | "in";

// =============================================================================
// Component Types (NetBox-compatible, schema-only)
// =============================================================================

/**
 * Network interface template definition (NetBox-compatible with Rackula extensions)
 * Used to define interface templates on DeviceType
 */
export interface InterfaceTemplate {
  /** Interface name (e.g., 'eth0', 'Gi1/0/1', 'Port 1') */
  name: string;
  /** Interface type (from InterfaceType enum) */
  type: InterfaceType;
  /** Alternative display label */
  label?: string;
  /** Management interface only (default: false) */
  mgmt_only?: boolean;
  /**
   * Interface position on device face (Rackula extension for visual layout).
   * When omitted, defaults to 'front' (matching DEFAULT_RACK_VIEW constant).
   * @default 'front'
   */
  position?: InterfacePosition;
  /** PoE mode: pd (powered device) or pse (power sourcing equipment) */
  poe_mode?: PoEMode;
  /** PoE type/standard */
  poe_type?: PoEType;
}

/**
 * @deprecated Use InterfaceTemplate instead
 * Legacy interface definition (kept for backward compatibility)
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
// PlacedPort Types
// =============================================================================

/**
 * Placed port instance - created when a device is placed in a rack
 * Provides stable UUID references for connections instead of fragile template name strings
 */
export interface PlacedPort {
  /** Unique identifier (UUID) - stable identity for connection references */
  id: string;
  /** Reference to InterfaceTemplate.name from DeviceType */
  template_name: string;
  /** Position index in DeviceType.interfaces array - for ordering and lookup */
  template_index: number;
  /** Cached interface type from template - avoids lookups for cable routing */
  type: InterfaceType;
  /** User override label for this port instance */
  label?: string;
}

// =============================================================================
// Connection Types (Port-based - MVP)
// =============================================================================

/**
 * Connection between two ports
 * MVP model: just the essential fields, add complexity when needed
 * References PlacedPort.id directly for stable connections
 */
export interface Connection {
  /** Unique identifier (UUID) */
  id: string;
  /** A-side port ID (PlacedPort.id) */
  a_port_id: string;
  /** B-side port ID (PlacedPort.id) */
  b_port_id: string;
  /** Optional user label */
  label?: string;
  /** Optional color for visualization (hex, e.g., '#FF5500') */
  color?: string;
}

// =============================================================================
// Cable Types (NetBox-compatible) - DEPRECATED
// =============================================================================

/**
 * @deprecated Use Connection instead - Cable uses fragile device+interface references
 */
export interface Cable {
  /** Unique identifier (UUID) */
  id: string;

  // --- A-side termination ---
  /** Placed device UUID (A-side) */
  a_device_id: string;
  /** Interface name on A-side device */
  a_interface: string;

  // --- B-side termination ---
  /** Placed device UUID (B-side) */
  b_device_id: string;
  /** Interface name on B-side device */
  b_interface: string;

  // --- Cable properties ---
  /** Cable type (e.g., 'cat6a', 'smf-os2') */
  type?: CableType;
  /** Cable color as 6-digit hex (e.g., '#FF5500') */
  color?: string;
  /** Cable label/identifier */
  label?: string;
  /** Cable length */
  length?: number;
  /** Length unit */
  length_unit?: LengthUnit;
  /** Connection status */
  status?: CableStatus;
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
  /** Width in slots (1 = half-width, 2 = full-width). Default: 2 */
  slot_width?: SlotWidth;
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
  /** Network interface templates */
  interfaces?: InterfaceTemplate[];
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
  /** Horizontal slot position (left, right, or full). Default: 'full' */
  slot_position?: SlotPosition;
  /** Optional custom display name for this placement */
  name?: string;

  // --- Port Instances ---
  /** Instantiated ports from DeviceType.interfaces with stable UUIDs */
  ports: PlacedPort[];

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
  /** Unique identifier (required for multi-rack support) */
  id: string;
  /** Display name */
  name: string;
  /** Height in rack units (1-100U) */
  height: number;
  /** Width in inches (10, 19, or 23) */
  width: 10 | 19 | 21 | 23;
  /** Descending units - if true, U1 is at top (default: false) */
  desc_units: boolean;
  /** Show rear view on canvas (default: true) */
  show_rear: boolean;
  /** Rack form factor */
  form_factor: FormFactor;
  /** Starting unit number (default: 1) */
  starting_unit: number;
  /** Order position for multi-rack layouts */
  position: number;
  /** Devices placed in this rack */
  devices: PlacedDevice[];
  /** Notes for this rack */
  notes?: string;
  /** Current view mode - runtime only, not persisted */
  view?: RackView;
}

/**
 * Layout preset for rack groups
 * - 'bayed': Stacked front/rear view for touring racks
 * - 'row': Side-by-side layout (default)
 * - 'custom': User-defined positioning
 */
export type RackGroupLayoutPreset = "bayed" | "row" | "custom";

/**
 * A group of racks with shared layout behavior
 * Used for touring/bayed rack configurations and linked rack constraints
 */
export interface RackGroup {
  /** Unique identifier */
  id: string;
  /** Optional display name */
  name?: string;
  /** References to Rack.id values in this group */
  rack_ids: string[];
  /** Layout preset for this group */
  layout_preset?: RackGroupLayoutPreset;
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
  /** Array of racks (multi-rack support) */
  racks: Rack[];
  /** Optional rack groups for linked/bayed configurations */
  rack_groups?: RackGroup[];
  /** Device type library */
  device_types: DeviceType[];
  /** Layout settings */
  settings: LayoutSettings;
  /** Port-to-port connections (MVP model) */
  connections?: Connection[];
  /**
   * @deprecated Use connections instead - cables uses fragile device+interface references
   */
  cables?: Cable[];
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
  width?: 10 | 19 | 21 | 23;
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
  /** Include annotation column in export */
  includeAnnotations?: boolean;
  /** Which field to show in annotation column */
  annotationField?: AnnotationField;
}
