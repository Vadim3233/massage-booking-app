import React, { useState } from "react";

function displayNameForAccount(session, profile) {
  return profile?.fullName
    || session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || "Client account";
}

export function ClientEmailSignInForm({ onEmailLogin, signingIn = false }) {
  const [email, setEmail] = useState("");

  async function submitEmail(event) {
    event.preventDefault();
    if (!onEmailLogin || signingIn) return;
    await onEmailLogin(email);
  }

  return (
    <form className="client-email-login-form" onSubmit={submitEmail}>
      <label>
        <span>Email address</span>
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
      </label>
      <button type="submit" className="client-email-login-button" disabled={signingIn}>
        {signingIn ? "Sending link..." : "Email me a sign-in link"}
      </button>
    </form>
  );
}

export function ClientAccountPanel({
  error = "",
  loading = false,
  notice = "",
  onEmailLogin,
  onGoogleLogin,
  onMyBookings,
  onSignOut,
  signingIn = false,
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
        <div className="client-account-button-row">
          <button type="button" className="secondary-button" onClick={onMyBookings}>My Bookings</button>
          <button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button>
        </div>
        {error && <p className="client-account-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="client-account-options" aria-label="Booking account options">
      <ClientEmailSignInForm onEmailLogin={onEmailLogin} signingIn={signingIn} />
      <button type="button" className="google-login-button" onClick={onGoogleLogin} disabled={signingIn}>
        <span className="google-mark" aria-hidden="true">G</span>
        Continue with Google
      </button>
      <button type="button" className="secondary-button client-my-bookings-entry" onClick={onMyBookings}>
        My Bookings
      </button>
      <p>Please sign in to manage your appointments. New bookings require approved client access.</p>
      {notice && <p className="client-account-notice" role="status">{notice}</p>}
      {error && <p className="client-account-error" role="alert">{error}</p>}
    </section>
  );
}
