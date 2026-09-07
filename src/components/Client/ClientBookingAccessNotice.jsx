import React from "react";
import { ClientAccountPanel } from "./ClientAccountPanel.jsx";

export function ClientBookingAccessNotice({ loading, message, onRetry, onSwitchAdmin, ...account }) {
  return (
    <section className="booking-page" aria-label="Booking access">
      <h1>Client booking</h1>
      <p role={loading ? "status" : "alert"}>{loading ? "Checking your booking access..." : message}</p>
      {!loading && <button type="button" className="secondary-button" onClick={onRetry}>Check access again</button>}
      <ClientAccountPanel {...account} loading={false} />
      {import.meta.env.DEV && <button type="button" className="secondary-button" onClick={onSwitchAdmin}>Admin</button>}
    </section>
  );
}
