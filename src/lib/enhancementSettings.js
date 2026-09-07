export const DEFAULT_ENHANCEMENTS = [
  { id: "head-massage", active: true, durationMinutes: 10, name: "Indian head massage", price: 18, description: "Focused scalp, neck, and shoulder release." },
  { id: "hot-stones", active: true, durationMinutes: 0, name: "Hot stones", price: 24, description: "Gentle heat for deeper muscle relaxation." },
  { id: "aromatherapy", active: true, durationMinutes: 0, name: "Aromatherapy oil", price: 12, description: "A calming oil blend added to your treatment." },
  { id: "extra-care", active: true, durationMinutes: 0, name: "Aftercare notes", price: 0, description: "Simple recovery tips after the appointment." },
];

export function normalizeEnhancement(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? "").trim();
  if (!name) return null;

  return {
    active: item.active !== false,
    description: String(item.description ?? "").trim(),
    durationMinutes: Math.max(0, Math.round(Number(item.durationMinutes) || 0)),
    id: String(item.id || `enhancement-${Date.now()}`),
    name,
    price: Math.max(0, Number(item.price) || 0),
  };
}

export function sanitizeStoredEnhancements(items) {
  if (!Array.isArray(items)) return DEFAULT_ENHANCEMENTS;
  return items.map(normalizeEnhancement).filter(Boolean);
}

export function getClientEnhancements(enhancements) {
  return (Array.isArray(enhancements) ? enhancements : [])
    .filter((enhancement) => enhancement.active !== false)
    .map((enhancement) => ({ ...enhancement, durationMinutes: 0 }));
}
