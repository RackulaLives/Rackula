/**
 * Performance Benchmark Script for Rackula
 *
 * Measures render performance at various device and port counts.
 * Run with: npx tsx scripts/performance-benchmark.ts
 *
 * For real browser measurements:
 * 1. Build production: npm run build
 * 2. Run performance tests in browser console using exported functions
 *
 * This script outputs test data generation metrics and provides
 * structured data for manual browser testing.
 */

import type {
  DeviceType,
  PlacedDevice,
  Rack,
  Interface,
} from "../src/lib/types";

// =============================================================================
// Test Data Generators
// =============================================================================

/**
 * Generate a device type with optional interfaces (ports)
 */
function generateDeviceType(index: number, portCount: number = 0): DeviceType {
  const interfaces: Interface[] = [];

  for (let i = 0; i < portCount; i++) {
    interfaces.push({
      name: `eth${i}`,
      type: i < 2 ? "10gbase-x-sfpp" : "1000base-t",
      mgmt_only: i === 0,
    });
  }

  return {
    slug: `test-device-${index}`,
    manufacturer: "Test Vendor",
    model: `Test Server ${index}`,
    u_height: 2,
    is_full_depth: true,
    colour: "#4A5568",
    category: "server",
    airflow: "front-to-rear",
    ...(portCount > 0 && { interfaces }),
  };
}

/**
 * Generate placed devices for a rack
 */
function generatePlacedDevices(
  count: number,
  rackHeight: number,
  deviceTypes: DeviceType[],
): PlacedDevice[] {
  const devices: PlacedDevice[] = [];
  let currentU = 1;

  for (let i = 0; i < count && currentU <= rackHeight - 1; i++) {
    const deviceType = deviceTypes[i % deviceTypes.length];
    devices.push({
      id: `placed-${i}`,
      device_type: deviceType.slug,
      position: currentU,
      face: "front",
    });
    currentU += deviceType.u_height;
  }

  return devices;
}

/**
 * Generate a complete test rack with devices
 */
function generateTestRack(
  deviceCount: number,
  portsPerDevice: number,
): {
  rack: Rack;
  deviceTypes: DeviceType[];
} {
  const rackHeight = 42;
  const deviceTypes: DeviceType[] = [];

  // Generate unique device types for each device
  for (let i = 0; i < deviceCount; i++) {
    deviceTypes.push(generateDeviceType(i, portsPerDevice));
  }

  const devices = generatePlacedDevices(deviceCount, rackHeight, deviceTypes);

  const rack: Rack = {
    id: "test-rack",
    name: "Performance Test Rack",
    height: rackHeight,
    width: 19,
    desc_units: false,
    show_rear: false,
    form_factor: "4-post",
    starting_unit: 1,
    position: 0,
    devices,
  };

  return { rack, deviceTypes };
}

// =============================================================================
// Test Scenarios
// =============================================================================

interface TestScenario {
  name: string;
  deviceCount: number;
  portsPerDevice: number;
  expectedElements: number;
}

const scenarios: TestScenario[] = [
  {
    name: "Empty rack",
    deviceCount: 0,
    portsPerDevice: 0,
    expectedElements: 42 * 6 + 43 + 42 * 2, // U slots + grid lines + U labels + mounting holes
  },
  {
    name: "10 devices (no ports)",
    deviceCount: 10,
    portsPerDevice: 0,
    expectedElements: 0, // Calculated at runtime
  },
  {
    name: "10 devices × 24 ports = 240 port elements",
    deviceCount: 10,
    portsPerDevice: 24,
    expectedElements: 240,
  },
  {
    name: "10 devices × 48 ports = 480 port elements",
    deviceCount: 10,
    portsPerDevice: 48,
    expectedElements: 480,
  },
  {
    name: "20 devices × 24 ports = 480 port elements (max rack)",
    deviceCount: 20,
    portsPerDevice: 24,
    expectedElements: 480,
  },
];

// =============================================================================
// Benchmark Runner
// =============================================================================

interface BenchmarkResult {
  scenario: string;
  deviceCount: number;
  totalPorts: number;
  dataGenerationMs: number;
  deviceTypes: DeviceType[];
  rack: Rack;
}

function runBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  console.log("\n=== Rackula Performance Benchmark ===\n");
  console.log("Generating test data for each scenario...\n");

  for (const scenario of scenarios) {
    const startTime = performance.now();
    const { rack, deviceTypes } = generateTestRack(
      scenario.deviceCount,
      scenario.portsPerDevice,
    );
    const endTime = performance.now();

    const totalPorts = scenario.deviceCount * scenario.portsPerDevice;

    results.push({
      scenario: scenario.name,
      deviceCount: scenario.deviceCount,
      totalPorts,
      dataGenerationMs: endTime - startTime,
      deviceTypes,
      rack,
    });

    console.log(`✓ ${scenario.name}`);
    console.log(`  - Devices: ${scenario.deviceCount}`);
    console.log(`  - Ports per device: ${scenario.portsPerDevice}`);
    console.log(`  - Total ports: ${totalPorts}`);
    console.log(`  - Data generation: ${(endTime - startTime).toFixed(2)}ms`);
    console.log("");
  }

  return results;
}

// =============================================================================
// Browser Test Instructions
// =============================================================================

function printBrowserInstructions(): void {
  console.log("\n=== Browser Performance Testing ===\n");
  console.log(`To measure real render performance:

1. Build production: npm run build
2. Serve locally: npm run preview
3. Open Chrome DevTools → Performance tab
4. Start recording
5. Load test data (see below)
6. Stop recording and analyze

Performance Metrics to Capture:
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Total Blocking Time (TBT)
- Scripting time
- Rendering time
- Layout time

Test Methodology:
- Clear browser cache before each test
- Use incognito mode
- Disable extensions
- Run 3 iterations, use median
- Test on mid-range hardware (not just M3 Mac)

Performance Budget (Target):
- Initial render: <16ms (60fps)
- Device render: <2ms per device
- Port render: <0.5ms per port group
- Pan/zoom: <16ms per frame
- Memory: <50MB for 20 devices with ports
`);
}

// =============================================================================
// Export for use in tests
// =============================================================================

export {
  generateDeviceType,
  generatePlacedDevices,
  generateTestRack,
  scenarios,
  runBenchmarks,
  type TestScenario,
  type BenchmarkResult,
};

// =============================================================================
// Main
// =============================================================================

// Run when executed directly
runBenchmarks();
printBrowserInstructions();
