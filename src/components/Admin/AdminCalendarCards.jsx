import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  ReceiptText,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

export function AdminCompactBookingCard({
  card,
  compact = false,
  onOpenOverview,
  onRequestDelete,
}) {
  if (card.kind === "personal") {
    return (
      <button
        type="button"
        className={`admin-personal-event-strip ${card.colorClass}`}
        key={card.id}
        onClick={() => onOpenOverview(card.booking)}
      >
        <strong>{card.title}</strong>
        <span>{card.subtitle}</span>
      </button>
    );
  }

  return (
    <article className={compact ? "admin-booking-box compact-admin-booking-box" : "admin-booking-box"} key={card.id}>
      <div className="admin-booking-title-row">
        <strong>{card.clientName}</strong>
        <span>{card.durationLabel}</span>
      </div>
      <div className="admin-booking-meta">
        <span>{card.timeRange}</span>
        <span>{card.bufferLabel}</span>
      </div>
      {card.displayReference && (
        <small className="admin-order-note">Ref {card.displayReference}</small>
      )}
      {!compact && (
        <div className="admin-booking-services">
          {card.serviceRows.map((item) => (
            <span key={item.key}>{item.label}</span>
          ))}
        </div>
      )}
      <div className="admin-booking-actions">
        <button type="button" onClick={() => onOpenOverview(card.booking)}>Overview</button>
        <a
          aria-disabled={card.mapDisabled}
          className={card.mapDisabled ? "disabled-map-link" : ""}
          href={card.mapDisabled ? undefined : card.mapUrl}
          rel="noreferrer"
          target="_blank"
        >
          Navigate
        </a>
        <button
          type="button"
          className="admin-danger-option"
          onClick={() => onRequestDelete(card.booking)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export function AdminTimelineBookingCard({
  card,
  onOpenOverview,
  onRequestDelete,
}) {
  return (
    <article
      className={card.className}
      key={card.id}
      style={card.style}
    >
      {card.serviceBands.map((band) => (
        <span
          aria-hidden="true"
          className={band.className}
          key={band.key}
          style={band.style}
        />
      ))}
      <span className="day-timeline-buffer-band" aria-hidden="true" />
      <div className="day-timeline-booking-main">
        <strong>{card.timeRange}</strong>
        <span>{card.serviceLabel}</span>
      </div>
      <small>
        <span className="timeline-client-name">{card.clientName}</span>
        {card.metaSuffix}
      </small>
      <div className="admin-booking-actions">
        <button type="button" onClick={() => onOpenOverview(card.booking)}>Overview</button>
        {!card.personal && (
          <a
            aria-disabled={card.mapDisabled}
            className={card.mapDisabled ? "disabled-map-link" : ""}
            href={card.mapDisabled ? undefined : card.mapUrl}
            rel="noreferrer"
            target="_blank"
          >
            Navigate
          </a>
        )}
        <button
          type="button"
          className="admin-danger-option"
          onClick={() => onRequestDelete(card.booking)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export function AdminAgendaBookingCard({
  card,
  onCancelBooking,
  onDeleteCancelled,
  onOpenEdit,
  onRestoreCancelled,
  onToggleExpanded,
}) {
  if (card.kind === "cancelled") {
    return (
      <article className="agenda-cancelled-booking-row" key={card.id}>
        <span>
          {card.timeLabel && <strong>{card.timeLabel}</strong>}
          Booking cancelled - {card.clientName}
          {card.durationMinutes > 0 && <small>{card.durationMinutes}m</small>}
          <small className="agenda-cancellation-source">{card.cancelledByLabel}</small>
        </span>
        <div className="agenda-cancelled-booking-actions">
          <button
            type="button"
            className="agenda-restore-cancelled-button"
            aria-label={`Restore cancelled booking for ${card.clientName}`}
            title="Restore booking"
            onClick={() => onRestoreCancelled(card.booking)}
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
          <button
            type="button"
            className="agenda-delete-cancelled-button"
            aria-label={`Delete cancelled booking for ${card.clientName}`}
            title="Delete cancelled booking"
            onClick={() => onDeleteCancelled(card.booking)}
          >
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className={card.className}
      key={card.id}
      style={card.style}
    >
      <button
        type="button"
        className="agenda-booking-card-main"
        onClick={() => onToggleExpanded(card.booking)}
        aria-expanded={card.expanded}
      >
        <span className="agenda-booking-time-block">
          <strong>{card.timeLabel}</strong>
          <small>{card.durationLabel}</small>
        </span>
        <span className="agenda-booking-content">
          <span className="agenda-booking-title-row">
            <strong>{card.clientName}</strong>
            {card.isNewClient && <em className="agenda-new-client-badge">New client</em>}
            {card.verificationInfo && <em className="agenda-verification-badge">{card.verificationInfo.badge}</em>}
          </span>
          <span>{card.primaryService}</span>
          {card.verificationInfo && <small className="agenda-verification-note">{card.verificationInfo.reason}</small>}
          <small><Clock3 aria-hidden="true" size={14} />{card.bufferLabel}</small>
        </span>
      </button>
      <div className="agenda-booking-side-actions">
        <a
          aria-disabled={card.mapDisabled}
          aria-label={`Navigate to ${card.clientName}`}
          className={`agenda-map-button${card.mapDisabled ? " disabled-map-link" : ""}`}
          href={card.mapDisabled ? undefined : card.mapUrl}
          rel="noreferrer"
          target="_blank"
          onClick={(event) => event.stopPropagation()}
        >
          <Send aria-hidden="true" size={21} strokeWidth={2.25} />
        </a>
        <button
          type="button"
          aria-label={card.expanded ? "Collapse booking details" : "Expand booking details"}
          className="agenda-expand-button"
          onClick={() => onToggleExpanded(card.booking)}
        >
          {card.expanded ? <ChevronDown aria-hidden="true" size={22} /> : <ChevronRight aria-hidden="true" size={22} />}
        </button>
      </div>
      {card.expanded && (
        <div className="agenda-booking-expanded">
          <div className="agenda-booking-expanded-info">
            {card.verificationInfo && (
              <span className="agenda-expanded-verification"><ReceiptText aria-hidden="true" size={18} /><strong>Needs action</strong><em>{card.verificationInfo.reason}</em></span>
            )}
            <span><CalendarDays aria-hidden="true" size={18} /><strong>Booking reference</strong><em>{card.displayReference}</em></span>
            {card.preferenceLabels.length > 0 && (
              <span><Sparkles aria-hidden="true" size={18} /><strong>Session preferences</strong><em>{card.preferenceLabels.join(", ")}</em></span>
            )}
            <span><FileText aria-hidden="true" size={18} /><strong>Client note</strong><em>{card.notesLabel}</em></span>
            {card.addressLabel && (
              <span><MapPin aria-hidden="true" size={18} /><strong>Address</strong><em>{card.addressLabel}</em></span>
            )}
          </div>
          <div className="agenda-booking-expanded-actions">
            <button
              type="button"
              onClick={() => onOpenEdit(card.booking)}
            >
              <FileText aria-hidden="true" size={17} />
              Edit Booking
            </button>
            <button
              type="button"
              className="admin-danger-option"
              onClick={() => onCancelBooking(card.booking)}
            >
              <X aria-hidden="true" size={18} />
              Cancel Booking
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
