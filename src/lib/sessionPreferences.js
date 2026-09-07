export const SESSION_PREFERENCE_CATEGORIES = [
  "Focus area",
  "Pressure",
  "Include",
  "Avoid",
  "Other",
];

export const DEFAULT_SESSION_PREFERENCES = [
  { id: "11111111-1111-4111-8111-111111111111", legacyId: "neck_focus", label: "Neck focus", category: "Focus area" },
  { id: "11111111-1111-4111-8111-111111111112", legacyId: "shoulder_focus", label: "Shoulder focus", category: "Focus area" },
  { id: "11111111-1111-4111-8111-111111111113", legacyId: "lower_back_focus", label: "Lower-back focus", category: "Focus area" },
  { id: "11111111-1111-4111-8111-111111111114", legacyId: "calf_focus", label: "Calf focus", category: "Focus area" },
  { id: "11111111-1111-4111-8111-111111111115", legacyId: "foot_focus", label: "Foot focus", category: "Focus area" },
  { id: "11111111-1111-4111-8111-111111111116", legacyId: "stronger_shoulders", label: "Stronger shoulders", category: "Pressure" },
  { id: "11111111-1111-4111-8111-111111111117", legacyId: "stronger_back", label: "Stronger back", category: "Pressure" },
  { id: "11111111-1111-4111-8111-111111111118", legacyId: "lighter_calves", label: "Lighter calves", category: "Pressure" },
  { id: "11111111-1111-4111-8111-111111111119", legacyId: "lighter_pressure", label: "Lighter pressure", category: "Pressure" },
  { id: "11111111-1111-4111-8111-111111111120", legacyId: "firm_pressure", label: "Firm pressure", category: "Pressure" },
  { id: "11111111-1111-4111-8111-111111111121", legacyId: "head_massage", label: "Head massage", category: "Include" },
  { id: "11111111-1111-4111-8111-111111111122", legacyId: "foot_massage", label: "Foot massage", category: "Include" },
  { id: "11111111-1111-4111-8111-111111111123", legacyId: "hand_massage", label: "Hand massage", category: "Include" },
  { id: "11111111-1111-4111-8111-111111111124", legacyId: "jaw_massage", label: "Jaw massage", category: "Include" },
  { id: "11111111-1111-4111-8111-111111111125", legacyId: "face_and_ears", label: "Face and ears", category: "Include" },
  { id: "11111111-1111-4111-8111-111111111126", legacyId: "abdomen_massage", label: "Abdomen massage", category: "Include" },
  { id: "11111111-1111-4111-8111-111111111127", legacyId: "avoid_feet", label: "Avoid feet", category: "Avoid" },
  { id: "11111111-1111-4111-8111-111111111128", legacyId: "avoid_head", label: "Avoid head", category: "Avoid" },
  { id: "11111111-1111-4111-8111-111111111129", legacyId: "avoid_abdomen", label: "Avoid abdomen", category: "Avoid" },
  { id: "11111111-1111-4111-8111-111111111130", legacyId: "avoid_sensitive_areas", label: "Avoid sensitive areas", category: "Avoid" },
].map((preference, index) => ({
  ...preference,
  conflictIds: [],
  sortOrder: index + 1,
  visible: true,
}));

export const SESSION_PREFERENCES = DEFAULT_SESSION_PREFERENCES;

export const INITIAL_SESSION_PREFERENCE_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "11111111-1111-4111-8111-111111111116",
  "11111111-1111-4111-8111-111111111118",
  "11111111-1111-4111-8111-111111111121",
  "11111111-1111-4111-8111-111111111122",
  "11111111-1111-4111-8111-111111111127",
];

export const SESSION_PREFERENCE_CONFLICTS = {
  "11111111-1111-4111-8111-111111111122": ["11111111-1111-4111-8111-111111111127"],
  "11111111-1111-4111-8111-111111111127": ["11111111-1111-4111-8111-111111111122"],
  "11111111-1111-4111-8111-111111111121": ["11111111-1111-4111-8111-111111111128"],
  "11111111-1111-4111-8111-111111111128": ["11111111-1111-4111-8111-111111111121"],
  "11111111-1111-4111-8111-111111111126": ["11111111-1111-4111-8111-111111111129"],
  "11111111-1111-4111-8111-111111111129": ["11111111-1111-4111-8111-111111111126"],
  "11111111-1111-4111-8111-111111111120": ["11111111-1111-4111-8111-111111111119"],
  "11111111-1111-4111-8111-111111111119": ["11111111-1111-4111-8111-111111111120"],
};

export const DEFAULT_SESSION_PREFERENCE_CONFLICTS = SESSION_PREFERENCE_CONFLICTS;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function defaultConflictIdsFor(preferenceId) {
  return SESSION_PREFERENCE_CONFLICTS[preferenceId] || [];
}

function defaultPreferenceByAnyId(value) {
  const id = cleanText(value);
  return DEFAULT_SESSION_PREFERENCES.find((preference) => preference.id === id || preference.legacyId === id) || null;
}

export function sanitizeSessionPreferences(items = DEFAULT_SESSION_PREFERENCES) {
  if (!Array.isArray(items)) return DEFAULT_SESSION_PREFERENCES;
  const usedIds = new Set();
  const normalized = items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const label = cleanText(item.label ?? item.name);
      if (!label) return null;
      const fallbackId = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const rawId = cleanText(item.id) || `${fallbackId || "preference"}_${index + 1}`;
      const defaultPreference = defaultPreferenceByAnyId(rawId);
      const id = defaultPreference?.id || rawId;
      if (!id || usedIds.has(id)) return null;
      usedIds.add(id);

      return {
        category: cleanText(item.category ?? item.group) || "Other",
        conflictIds: Array.isArray(item.conflictIds) && item.conflictIds.length > 0
          ? item.conflictIds.map(cleanText).filter(Boolean)
          : cleanText(item.conflictId)
            ? [cleanText(item.conflictId)]
            : defaultConflictIdsFor(id),
        deletedAt: cleanText(item.deletedAt),
        id,
        label,
        legacyId: cleanText(item.legacyId) || defaultPreference?.legacyId || "",
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index + 1,
        visible: item.visible !== false && item.active !== false,
      };
    })
    .filter(Boolean)
    .map((item) => ({
      ...item,
      conflictIds: [...new Set(item.conflictIds)]
        .map((conflictId) => defaultPreferenceByAnyId(conflictId)?.id || conflictId)
        .filter((conflictId) => conflictId !== item.id && usedIds.has(conflictId)),
    }))
    .sort((first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label))
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));

  return normalized;
}

export function visibleSessionPreferences(items = SESSION_PREFERENCES) {
  return sanitizeSessionPreferences(items).filter((preference) => preference.visible && !preference.deletedAt);
}

function preferenceMapFor(items = SESSION_PREFERENCES) {
  return new Map(sanitizeSessionPreferences(items).map((preference) => [preference.id, preference]));
}

function snapshotLabelMap(snapshots = []) {
  if (!Array.isArray(snapshots)) return new Map();
  return new Map(
    snapshots
      .map((snapshot) => {
        if (typeof snapshot === "string") return ["", cleanText(snapshot)];
        if (!snapshot || typeof snapshot !== "object") return ["", ""];
        return [cleanText(snapshot.id), cleanText(snapshot.label)];
      })
      .filter(([, label]) => label)
  );
}

export function normalizeSessionPreferenceIds(ids = [], preferences = SESSION_PREFERENCES) {
  if (!Array.isArray(ids)) return [];
  const allowedPreferences = sanitizeSessionPreferences(preferences).filter((item) => !item.deletedAt);
  const allowedIds = new Set(allowedPreferences.map((item) => item.id));
  const legacyIdLookup = new Map(allowedPreferences.map((item) => [item.legacyId, item.id]).filter(([legacyId]) => legacyId));
  const normalized = [];

  ids.forEach((id) => {
    const preferenceId = typeof id === "string" ? id.trim() : "";
    const normalizedId = legacyIdLookup.get(preferenceId) || preferenceId;
    if (normalizedId && allowedIds.has(normalizedId) && !normalized.includes(normalizedId)) {
      normalized.push(normalizedId);
    }
  });

  return normalized;
}

export function toggleSessionPreferenceId(currentIds = [], preferenceId = "", preferences = SESSION_PREFERENCES) {
  const normalizedId = typeof preferenceId === "string" ? preferenceId.trim() : "";
  const visibleIds = new Set(visibleSessionPreferences(preferences).map((preference) => preference.id));
  const current = normalizeSessionPreferenceIds(currentIds, preferences).filter((id) => visibleIds.has(id));
  const normalizedPreferenceId = defaultPreferenceByAnyId(normalizedId)?.id || normalizedId;
  if (!visibleIds.has(normalizedPreferenceId)) return current;

  if (current.includes(normalizedPreferenceId)) {
    return current.filter((id) => id !== normalizedPreferenceId);
  }

  const preferencesById = preferenceMapFor(preferences);
  const selectedPreference = preferencesById.get(normalizedPreferenceId);
  const conflicts = new Set(selectedPreference?.conflictIds || []);
  preferencesById.forEach((preference) => {
    if (preference.conflictIds?.includes(normalizedPreferenceId)) conflicts.add(preference.id);
  });
  return [...current.filter((id) => !conflicts.has(id)), normalizedPreferenceId];
}

export function sessionPreferenceLabels(ids = [], preferences = SESSION_PREFERENCES, snapshots = []) {
  if (!Array.isArray(ids)) return [];
  const preferencesById = preferenceMapFor(preferences);
  const snapshotsById = snapshotLabelMap(snapshots);
  return [...new Set(ids.map(cleanText).filter(Boolean))]
    .map((id) => {
      const normalizedId = defaultPreferenceByAnyId(id)?.id || id;
      return snapshotsById.get(id) || snapshotsById.get(normalizedId) || preferencesById.get(normalizedId)?.label;
    })
    .filter(Boolean);
}

export function sessionPreferenceSnapshots(ids = [], preferences = SESSION_PREFERENCES) {
  const preferencesById = preferenceMapFor(preferences);
  return normalizeSessionPreferenceIds(ids, preferences)
    .map((id) => ({ id, label: preferencesById.get(id)?.label || "" }))
    .filter((item) => item.label);
}
