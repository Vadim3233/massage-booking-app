export const serviceAreas = [
  { id: "chelsea", name: "Chelsea", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "kensington", name: "Kensington", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "fulham", name: "Fulham", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "chiswick", name: "Chiswick", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "hammersmith", name: "Hammersmith", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "belgravia", name: "Belgravia", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "ealing", name: "Ealing", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "acton", name: "Acton", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "mayfair", name: "Mayfair", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "notting_hill", name: "Notting Hill", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "shepherds_bush", name: "Shepherd's Bush", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "earls_court", name: "Earl's Court", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "westminster", name: "Westminster", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "paddington", name: "Paddington", active: true, congestionFee: 0, travelSurcharge: 0 },
  { id: "marylebone", name: "Marylebone", active: true, congestionFee: 0, travelSurcharge: 0 },
];

function sanitizeFee(value) {
  return Math.max(0, Number(value) || 0);
}

export function sanitizeServiceAreas(value) {
  const incoming = Array.isArray(value) ? value : [];
  const incomingById = new Map(incoming.map((area) => [area?.id, area]));

  const defaultAreas = serviceAreas.map((area) => {
    const stored = incomingById.get(area.id);

    return {
      ...area,
      name: typeof stored?.name === "string" && stored.name.trim() ? stored.name.trim() : area.name,
      active: typeof stored?.active === "boolean" ? stored.active : area.active,
      congestionFee: sanitizeFee(stored?.congestionFee),
      travelSurcharge: sanitizeFee(stored?.travelSurcharge),
    };
  });

  const defaultIds = new Set(serviceAreas.map((area) => area.id));
  const customAreas = incoming
    .filter((area) => area && !defaultIds.has(area.id))
    .map((area) => ({
      active: typeof area.active === "boolean" ? area.active : true,
      custom: true,
      congestionFee: sanitizeFee(area.congestionFee),
      id: String(area.id || "").trim(),
      name: String(area.name || "").trim(),
      travelSurcharge: sanitizeFee(area.travelSurcharge),
    }))
    .filter((area) => area.id && area.name);

  return [...defaultAreas, ...customAreas];
}

export function getServiceAreaFees(serviceAreasValue = [], areaId = "") {
  const area = serviceAreasValue.find((item) => item.id === areaId);

  return {
    congestionFee: sanitizeFee(area?.congestionFee),
    travelSurcharge: sanitizeFee(area?.travelSurcharge),
  };
}
