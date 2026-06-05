export const serviceAreas = [
  { id: "chelsea", name: "Chelsea", active: true },
  { id: "kensington", name: "Kensington", active: true },
  { id: "fulham", name: "Fulham", active: true },
  { id: "chiswick", name: "Chiswick", active: true },
  { id: "hammersmith", name: "Hammersmith", active: true },
  { id: "belgravia", name: "Belgravia", active: true },
  { id: "ealing", name: "Ealing", active: true },
  { id: "acton", name: "Acton", active: true },
  { id: "mayfair", name: "Mayfair", active: true },
  { id: "notting_hill", name: "Notting Hill", active: true },
  { id: "shepherds_bush", name: "Shepherd's Bush", active: true },
  { id: "earls_court", name: "Earl's Court", active: true },
  { id: "westminster", name: "Westminster", active: true },
  { id: "paddington", name: "Paddington", active: true },
  { id: "marylebone", name: "Marylebone", active: true },
];

export function sanitizeServiceAreas(value) {
  const incoming = Array.isArray(value) ? value : [];
  const incomingById = new Map(incoming.map((area) => [area?.id, area]));

  const defaultAreas = serviceAreas.map((area) => {
    const stored = incomingById.get(area.id);

    return {
      ...area,
      name: typeof stored?.name === "string" && stored.name.trim() ? stored.name.trim() : area.name,
      active: typeof stored?.active === "boolean" ? stored.active : area.active,
    };
  });

  const defaultIds = new Set(serviceAreas.map((area) => area.id));
  const customAreas = incoming
    .filter((area) => area && !defaultIds.has(area.id))
    .map((area) => ({
      active: typeof area.active === "boolean" ? area.active : true,
      custom: true,
      id: String(area.id || "").trim(),
      name: String(area.name || "").trim(),
    }))
    .filter((area) => area.id && area.name);

  return [...defaultAreas, ...customAreas];
}
