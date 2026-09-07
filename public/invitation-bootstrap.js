// Runs before the application and its resource imports. Never log the URL/token.
(function () {
  if (!window.location.pathname.startsWith('/invite/')) return;
  var value = window.location.pathname.slice('/invite/'.length);
  var valid = /^[0-9a-f]{64}$/.test(value);
  try {
    sessionStorage.removeItem('vad-invitation-context');
    sessionStorage.setItem('vad-invitation-entry', valid ? 'captured' : 'invalid');
    if (valid) sessionStorage.setItem('vad-invitation-context', JSON.stringify({ token: value, capturedAt: Date.now() }));
  } catch (_) { /* Storage unavailable: onboarding fails closed. */ }
  window.history.replaceState(null, '', '/onboarding');
})();
