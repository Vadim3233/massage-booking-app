import { ChevronDown } from "lucide-react";

export function AdminAgendaDayHeader({
  header,
  onOpenAppointment,
  onOpenScheduleMode,
  onOpenWorkingHours,
}) {
  return (
    <div className="admin-agenda-day-topline">
      <h3>
        <button
          type="button"
          className="admin-agenda-day-add"
          onClick={() => onOpenAppointment(header.day)}
        >
          {header.dateLabel}
        </button>
        {header.isToday && <span className="admin-today-marker"><span aria-hidden="true" />Today</span>}
      </h3>
      <div className="agenda-day-meta-controls" aria-label={header.controlsAriaLabel}>
        <button
          type="button"
          className={header.hoursButtonClassName}
          onClick={() => onOpenWorkingHours(header.day)}
        >
          <span>{header.hoursLabel}</span>
          {header.customBadgeLabel && <b aria-label={header.customBadgeAriaLabel}>{header.customBadgeLabel}</b>}
        </button>
        <button
          type="button"
          className="agenda-day-mode-button"
          onClick={() => onOpenScheduleMode(header.day)}
        >
          <span className={header.modeBadgeClassName}>{header.modeLabel}</span>
          {header.anchorActive && (
            <span className="agenda-anchor-badge" aria-label={header.anchorAriaLabel}>
              {header.anchorText}
            </span>
          )}
          <ChevronDown aria-hidden="true" size={16} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

export function AdminAgendaView({
  agenda,
  agendaListRef,
  onBindDayRef,
  onOpenAppointment,
  onOpenScheduleMode,
  onOpenWorkingHours,
  renderBookingCard,
}) {
  return (
    <div className="admin-agenda-list" ref={agendaListRef}>
      {agenda.days.map((day) => (
        <section
          className={day.className}
          data-agenda-date-value={day.dateValue}
          key={day.id}
          ref={(node) => onBindDayRef(day.dateValue, node)}
        >
          <AdminAgendaDayHeader
            header={day.header}
            onOpenAppointment={onOpenAppointment}
            onOpenScheduleMode={onOpenScheduleMode}
            onOpenWorkingHours={onOpenWorkingHours}
          />
          {day.summary && (
            <div className="admin-day-summary-line" aria-label="Daily summary">
              {day.summary.items.map((item) => <span key={item.id}>{item.label}</span>)}
            </div>
          )}
          {day.bookings.map((booking) => renderBookingCard(booking))}
        </section>
      ))}
    </div>
  );
}

export function AdminCalendarTimeGrid({
  grid,
  gridRef,
  renderCompactCard,
  renderTimelineCard,
}) {
  if (grid.empty) {
    return (
      <div className="admin-calendar-overview">
        <p className="admin-year-month-empty">No bookings recorded for this past period.</p>
      </div>
    );
  }

  return (
    <div
      className={grid.className}
      ref={gridRef}
      style={grid.style}
    >
      <div className="admin-grid-times" style={grid.timeColumnStyle}>
        {grid.hours.map((hour) => <span key={hour.value}>{hour.label}</span>)}
      </div>
      {grid.days.map((day) => (
        <div className="admin-grid-day" data-date-value={day.dateValue} key={day.id}>
          <h3>{day.label}</h3>
          <div className="admin-grid-column" style={day.columnStyle}>
            {day.hourLines.map((hour) => <span className="grid-hour-line" key={hour} />)}
            {day.blocks.map((block) => (
              <div
                className={block.className}
                key={block.id}
                style={block.style}
              >
                {block.compact
                  ? renderCompactCard(block.booking, true)
                  : renderTimelineCard(block.booking)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
