function rectanglePolygon([west, south, east, north]) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

function zoneId(zoneKey, subZoneKey) {
  return `${zoneKey}_${subZoneKey}`;
}

function makeBandZones(zoneName, zoneKey, [west, south, east, north]) {
  const height = (north - south) / 3;
  return [
    {
      id: zoneId(zoneKey, "north"),
      zoneName,
      subZoneName: `${zoneName} North`,
      polygon: rectanglePolygon([west, south + height * 2, east, north]),
    },
    {
      id: zoneId(zoneKey, "central"),
      zoneName,
      subZoneName: `${zoneName} Central`,
      polygon: rectanglePolygon([west, south + height, east, south + height * 2]),
    },
    {
      id: zoneId(zoneKey, "south"),
      zoneName,
      subZoneName: `${zoneName} South`,
      polygon: rectanglePolygon([west, south, east, south + height]),
    },
  ];
}

function makeQuadrantZones(zoneName, zoneKey, [west, south, east, north]) {
  const midLng = (west + east) / 2;
  const midLat = (south + north) / 2;
  return [
    {
      id: zoneId(zoneKey, "north"),
      zoneName,
      subZoneName: `${zoneName} North`,
      polygon: rectanglePolygon([west, midLat, east, north]),
    },
    {
      id: zoneId(zoneKey, "south"),
      zoneName,
      subZoneName: `${zoneName} South`,
      polygon: rectanglePolygon([west, south, east, midLat]),
    },
    {
      id: zoneId(zoneKey, "east"),
      zoneName,
      subZoneName: `${zoneName} East`,
      polygon: rectanglePolygon([midLng, south, east, north]),
    },
    {
      id: zoneId(zoneKey, "west"),
      zoneName,
      subZoneName: `${zoneName} West`,
      polygon: rectanglePolygon([west, south, midLng, north]),
    },
  ];
}

// Starter polygon boundaries use [longitude, latitude] coordinates.
// To fine tune the map later, edit these bounds or replace each generated polygon
// with a more detailed hand-drawn GeoJSON Polygon.
const AREA_BOUNDS = [
  ["Chelsea", "chelsea", [-0.19, 51.475, -0.145, 51.495], "bands"],
  ["Kensington", "kensington", [-0.215, 51.49, -0.17, 51.515], "bands"],
  ["Chiswick", "chiswick", [-0.29, 51.47, -0.235, 51.505], "quadrants"],
  ["Hammersmith", "hammersmith", [-0.245, 51.485, -0.205, 51.51], "bands"],
  ["Fulham", "fulham", [-0.225, 51.455, -0.17, 51.49], "quadrants"],
  ["Shepherd's Bush", "shepherds_bush", [-0.24, 51.5, -0.205, 51.525], "bands"],
  ["Notting Hill", "notting_hill", [-0.215, 51.51, -0.18, 51.535], "bands"],
  ["Mayfair", "mayfair", [-0.165, 51.505, -0.135, 51.52], "bands"],
  ["Ealing", "ealing", [-0.335, 51.495, -0.27, 51.535], "quadrants"],
  ["Acton", "acton", [-0.295, 51.495, -0.245, 51.525], "quadrants"],
  ["Richmond", "richmond", [-0.32, 51.43, -0.25, 51.48], "quadrants"],
  ["Putney", "putney", [-0.24, 51.445, -0.19, 51.47], "bands"],
  ["Westminster", "westminster", [-0.155, 51.49, -0.115, 51.515], "quadrants"],
  ["Earl's Court", "earls_court", [-0.2, 51.485, -0.175, 51.5], "bands"],
  ["Paddington", "paddington", [-0.19, 51.515, -0.16, 51.535], "bands"],
  ["Marylebone", "marylebone", [-0.17, 51.515, -0.14, 51.535], "bands"],
];

export const londonWorkingZones = AREA_BOUNDS.flatMap(([zoneName, zoneKey, bounds, split]) =>
  split === "quadrants"
    ? makeQuadrantZones(zoneName, zoneKey, bounds)
    : makeBandZones(zoneName, zoneKey, bounds)
);

export const DEFAULT_ACTIVE_WORKING_ZONE_IDS = londonWorkingZones.map((zone) => zone.id);

export function getWorkingZoneById(id) {
  return londonWorkingZones.find((zone) => zone.id === id) ?? null;
}
