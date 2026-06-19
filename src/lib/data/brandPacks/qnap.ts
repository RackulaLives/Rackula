/**
 * QNAP Brand Pack
 * Pre-defined device types for QNAP rack-mountable devices
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * QNAP device definitions (13 devices)
 */
export const qnapDevices: DeviceType[] = [
  {
    slug: "qnap-ts-1263u-rp",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-1263U-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-1683xu-rp",
    u_height: 3,
    manufacturer: "QNAP",
    model: "TS-1683XU-RP",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-431u",
    u_height: 1,
    manufacturer: "QNAP",
    model: "TS-431U",
    is_full_depth: false,
    airflow: "side-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-432pxu",
    u_height: 1,
    manufacturer: "QNAP",
    model: "TS-432PXU",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-432pxu-rp",
    u_height: 1,
    manufacturer: "QNAP",
    model: "TS-432PXU-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-463u-rp",
    u_height: 1,
    manufacturer: "QNAP",
    model: "TS-463U-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-832pxu-rp",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-832PXU-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-873aeu",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-873AeU",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-879u-rp",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-879U-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-883xu-rp",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-883XU-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-ec1280u",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-EC1280U",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-ts-h1886xu-rp",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TS-h1886XU-RP",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
  {
    slug: "qnap-tvs-ec1580mu-sas-rp",
    u_height: 2,
    manufacturer: "QNAP",
    model: "TVS-EC1580MU-SAS-RP",
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.storage,
    category: "storage",
  },
];
