import React from "react";
import { CheckCircle2 } from "lucide-react";

export function AdminPendingVerificationPanel({
  actionDisabled = false,
  bookings = [],
  onCompleteVerification,
  onOpenAgenda,
  onOpenDetails,
}) {
  return (
    <section className="admin-screen admin-pending-screen">
      <div className="admin-screen-heading">
        <div>
          <p>Pending verification</p>
          <h2>Bookings to review</h2>
          <span className="admin-screen-helper">
            Bank transfers and cash requests that still need your approval.
          </span>
        </div>
        <strong className="admin-pending-count">
          {bookings.length} pending
        </strong>
      </div>

      {bookings.length === 0 ? (
        <div className="admin-pending-empty">
          <CheckCircle2 aria-hidden="true" size={30} />
          <strong>Nothing waiting for approval</strong>
          <span>New bank-transfer and cash requests will appear here automatically.</span>
        </div>
      ) : (
        <div className="admin-pending-list">
          {bookings.map((booking) => (
            <article className={`admin-pending-card admin-pending-${booking.tone}`} key={booking.id}>
              <div className="admin-pending-main">
                <span className="admin-pending-status">{booking.reason}</span>
                <h3>{booking.clientName}</h3>
                <div className="admin-pending-meta">
                  <span>{booking.dateLabel}</span>
                  <span>{booking.timeLabel}</span>
                  <span>{booking.serviceLabel}</span>
                  {booking.totalLabel && <span>{booking.totalLabel}</span>}
                </div>
                <small>{booking.referenceLabel}</small>
              </div>
              <div className="admin-pending-actions">
                <button type="button" className="admin-secondary-action" onClick={() => onOpenAgenda(booking.booking)}>
                  Agenda
                </button>
                <button type="button" className="admin-secondary-action" onClick={() => onOpenDetails(booking.booking)}>
                  Details
                </button>
                <button
                  type="button"
                  className="admin-primary-action"
                  disabled={actionDisabled}
                  onClick={() => onCompleteVerification(booking.booking)}
                >
                  {booking.actionLabel}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
