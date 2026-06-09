import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";
import { DEFAULT_ACTIVE_WORKING_ZONE_IDS, londonWorkingZones } from "./londonWorkingZones.js";

const POSTCODES_IO_BASE_URL = "https://api.postcodes.io/postcodes";

// Edit this polygon later with coordinates in [longitude, latitude] order.
// Placeholder roughly covers the west/central London area shown on the working map.
export const serviceAreaPolygon = polygon([
  [
    [-0.3005, 51.5165],
    [-0.245, 51.548],
    [-0.165, 51.545],
    [-0.085, 51.515],
    [-0.098, 51.478],
    [-0.16, 51.462],
    [-0.225, 51.458],
    [-0.285, 51.485],
    [-0.3005, 51.5165],
  ],
]);

async function lookupPostcodeCoordinates(postcode) {
  const normalizedPostcode = String(postcode ?? "").trim().toUpperCase();

  if (!normalizedPostcode) {
    return { ok: false, reason: "invalid_postcode" };
  }

  try {
    const response = await fetch(`${POSTCODES_IO_BASE_URL}/${encodeURIComponent(normalizedPostcode)}`);

    if (!response.ok) {
      return { ok: false, reason: "invalid_postcode" };
    }

    const payload = await response.json();
    const result = payload?.result;
    const lat = Number(result?.latitude);
    const lng = Number(result?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, reason: "invalid_postcode" };
    }

    return { ok: true, postcode: normalizedPostcode, lat, lng };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

export async function checkPostcodeInServiceArea(postcode) {
  const lookup = await lookupPostcodeCoordinates(postcode);
  if (!lookup.ok) return lookup;

  const inside = booleanPointInPolygon(point([lookup.lng, lookup.lat]), serviceAreaPolygon);

  return { ...lookup, inside };
}

export async function checkPostcodeInSelectedWorkingZones(postcode, activeZoneIds = DEFAULT_ACTIVE_WORKING_ZONE_IDS) {
  const lookup = await lookupPostcodeCoordinates(postcode);
  if (!lookup.ok) return lookup;

  const activeZoneIdSet = new Set(Array.isArray(activeZoneIds) ? activeZoneIds : []);
  const activeZones = londonWorkingZones.filter((zone) => activeZoneIdSet.has(zone.id));
  const postcodePoint = point([lookup.lng, lookup.lat]);
  const matchedZones = activeZones.filter((zone) => booleanPointInPolygon(postcodePoint, zone.polygon));
  const inside = matchedZones.length > 0;

  return {
    ...lookup,
    inside,
    matchedZones,
  };
}
