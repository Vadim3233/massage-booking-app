const OBSOLETE_CLIENT_SESSION_KEYS = [
  "vad-invitation-context",
  "vad-invitation-entry",
  "chainScheduler.recentGuestBookingContext",
];

export function clearObsoleteClientSessionStorage(storage = globalThis.sessionStorage) {
  if (!storage) return;
  for (const key of OBSOLETE_CLIENT_SESSION_KEYS) {
    try { storage.removeItem(key); } catch { /* Storage can be unavailable. */ }
  }
}

export { OBSOLETE_CLIENT_SESSION_KEYS };
