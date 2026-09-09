import React from "react";

function displayNameForAccount(session, profile) {
  return profile?.fullName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "Client account";
}

export function ClientAccountPanel({ error="", loading=false, onMyBookings, onSignOut, profile, session }) {
  if (loading) return <p className="client-account-loading" role="status">Checking your account...</p>;
  if (!session?.user) return null;
  return <section className="client-account-state" aria-label="Client account">
    <div><span>Signed in</span><strong>{displayNameForAccount(session,profile)}</strong><small>{profile?.email||session.user.email||""}</small></div>
    <div className="client-account-button-row">{onMyBookings&&<button type="button" className="secondary-button" onClick={onMyBookings}>My Bookings</button>}<button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button></div>
    {error&&<p className="client-account-error" role="alert">{error}</p>}
  </section>;
}
