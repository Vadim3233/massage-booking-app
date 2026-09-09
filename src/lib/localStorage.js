import { DEFAULT_DOCUMENT_SETTINGS } from "../config/documentSettings.js";
import { STORAGE_VERSION } from "../config/storageKeys.js";

export function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function readStoredJson(key, fallback) {
  try {
    const storedValue = window.localStorage.getItem(key);
    if (!storedValue) return fallback;

    const payload = JSON.parse(storedValue);
    if (!payload || payload.version !== STORAGE_VERSION || !("data" in payload)) {
      return fallback;
    }

    return payload.data;
  } catch {
    return fallback;
  }
}

export function sanitizeClientNotes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([clientId, note]) => typeof clientId === "string" && clientId && note && typeof note === "object")
      .map(([clientId, note]) => {
        const sourceNotes = Array.isArray(note.notes)
          ? note.notes
          : typeof note.text === "string" && note.text.trim()
            ? [{ id: `${clientId}-legacy-note`, text: note.text, createdAt: note.updatedAt || "" }]
            : [];
        const notes = sourceNotes
          .filter((entry) => entry && typeof entry === "object" && typeof entry.text === "string" && entry.text.trim())
          .map((entry, index) => ({
            createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
            id: typeof entry.id === "string" && entry.id ? entry.id : `${clientId}-note-${index}`,
            text: entry.text.trim(),
          }));

        return [clientId, { notes }];
      })
  );
}

export function sanitizeClientProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { deletedIds: [], overrides: {} };
  const overrides = value.overrides && typeof value.overrides === "object" && !Array.isArray(value.overrides)
    ? Object.fromEntries(
        Object.entries(value.overrides)
          .filter(([clientId, profile]) => typeof clientId === "string" && clientId && profile && typeof profile === "object")
          .map(([clientId, profile]) => [
            clientId,
            {
              address: typeof profile.address === "string" ? profile.address : "",
              email: typeof profile.email === "string" ? profile.email : "",
              name: typeof profile.name === "string" ? profile.name : "",
              phone: typeof profile.phone === "string" ? profile.phone : "",
              updates: typeof profile.updates === "string" ? profile.updates : "",
            },
          ])
      )
    : {};
  const deletedIds = Array.isArray(value.deletedIds)
    ? value.deletedIds.filter((id) => typeof id === "string" && id)
    : [];

  return { deletedIds: [...new Set(deletedIds)], overrides };
}

export function sanitizeDocumentSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_DOCUMENT_SETTINGS };
  return Object.fromEntries(
    Object.entries(DEFAULT_DOCUMENT_SETTINGS).map(([key, fallback]) => [
      key,
      typeof fallback === "boolean"
        ? Boolean(value[key])
        : typeof value[key] === "string"
          ? value[key]
          : fallback,
    ])
  );
}

export function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, data: value }));
  } catch {
    // Persistence is best-effort in browsers where localStorage is blocked.
  }
}

export function removeStoredValue(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Persistence is best-effort in browsers where localStorage is blocked.
  }
}

export function readSessionJson(key, fallback) {
  try {
    const storedValue = window.sessionStorage.getItem(key);
    if (!storedValue) return fallback;
    const payload = JSON.parse(storedValue);
    if (!payload || payload.version !== STORAGE_VERSION || !("data" in payload)) return fallback;
    return payload.data;
  } catch {
    return fallback;
  }
}

export function writeSessionJson(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, data: value }));
  } catch {
    // Session persistence is best-effort after OAuth redirects.
  }
}

export function removeSessionValue(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Session persistence is best-effort after OAuth redirects.
  }
}
