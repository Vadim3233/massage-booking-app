import React from "react";

function displayNameForAccount(session, profile) {
  return profile?.fullName
    || session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || "Client account";
}

export function ClientAccountPanel({
  error = "",
  loading = false,
  onGoogleLogin,
  onSignOut,
  profile,
  session,
}) {
  if (loading) {
    return <p className="client-account-loading" role="status">Checking your account...</p>;
  }

  if (session?.user) {
    return (
      <section className="client-account-state" aria-label="Client account">
        <div>
          <span>Signed in</span>
          <strong>{displayNameForAccount(session, profile)}</strong>
          <small>{profile?.email || session.user.email || ""}</small>
        </div>
        <button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button>
        {error && <p className="client-account-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="client-account-options" aria-label="Booking account options">
      <button type="button" className="google-login-button" onClick={onGoogleLogin}>
        <span className="google-mark" aria-hidden="true">G</span>
        Continue with Google
      </button>
      <p>You can also continue as a guest. Sign-in is optional.</p>
      {error && <p className="client-account-error" role="alert">{error}</p>}
    </section>
  );
}
