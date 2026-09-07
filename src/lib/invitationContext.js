const KEY = 'vad-invitation-context';
export function clearInvitationContext(storage = window.sessionStorage) {
  try { storage.removeItem(KEY); storage.removeItem('vad-invitation-entry'); } catch { /* No persistent fallback. */ }
}
export function readInvitationContext(storage = window.sessionStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || 'null');
    if (value && /^[0-9a-f]{64}$/.test(value.token) && Number.isFinite(value.capturedAt)
      && now >= value.capturedAt && now - value.capturedAt < 24 * 60 * 60 * 1000) return value.token;
  } catch { /* Missing/corrupt storage is lost context, never authorization. */ }
  clearInvitationContext(storage);
  return null;
}
export function onboardingRedirect({ production = import.meta.env?.PROD, origin = window.location.origin } = {}) {
  return new URL('/onboarding', production ? 'https://booking.vadmassage.com' : origin).href;
}
export const invitationMessages = {
  INVALID: 'Invitation no longer valid. Please contact Vad for a new invitation.',
  EXPIRED: 'Invitation expired. Please contact Vad for a new invitation.',
  REVOKED: 'Invitation no longer valid. Please contact Vad for a new invitation.',
  LINKED: 'Invitation already used. If you already have an account, sign in normally. Otherwise, contact Vad for a new invitation.',
  LOST: 'Please reopen your original invitation in this tab to continue setting up your account.',
};
export function validateOnboardingProfile(fields) {
  if (![fields.first_name, fields.last_name].every(value => typeof value === 'string' && value.trim() && value.trim().length <= 100 && !/[\u0000-\u001f\u007f]/.test(value))) return 'Please enter your first and last name (up to 100 characters each).';
  if (!/^\+?[1-9]\d{7,14}$/.test(String(fields.mobile || '').replace(/[\s().-]/g, ''))) return 'Please enter a valid mobile number, including the country code.';
  return '';
}
