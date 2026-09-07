import { Send } from "lucide-react";

function renderOverviewDay(day, onSelectDate, onOpenBookingDetails) {
  return (
    <article
      className={[
        "admin-calendar-overview-day",
        day.compact ? "compact-calendar-overview-day" : "",
        day.expandable ? "expandable-calendar-overview-day" : "",
        day.expanded ? "expanded-calendar-overview-day" : "",
        day.isToday ? "today-calendar-overview-day" : "",
        day.isSelected ? "selected-calendar-overview-day" : "",
      ].filter(Boolean).join(" ")}
      key={day.dateValue}
    >
      <button
        type="button"
        className="admin-calendar-overview-day-button"
        onClick={() => onSelectDate(day.dateValue)}
        aria-expanded={day.expandable ? day.expanded : undefined}
      >
        <span>{day.label}</span>
        <strong>{day.dayNumberLabel}</strong>
        {!day.compact && <small>{day.bookingCount} booking{day.bookingCount === 1 ? "" : "s"}</small>}
        {day.previewBookings.map((booking) => (
          <em key={booking.id}>
            {booking.timeLabel} {booking.clientName}{booking.cancelled ? " cancelled" : ""}
          </em>
        ))}
      </button>

      {day.expanded && (
        <div className="admin-week-day-expanded">
          {day.expandedBookings.length > 0 ? (
            day.expandedBookings.map((booking) => (
              <article className="admin-week-booking-row" key={booking.id}>
                <div>
                  <strong>{booking.timeLabel} {booking.clientName}</strong>
                  <span>{booking.primaryService}</span>
                  <small>{booking.durationMinutes}m treatment | Buffer {booking.travelMinutes}m</small>
                  {booking.addressLabel && <em>{booking.addressLabel}</em>}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenBookingDetails(booking.booking)}
                  >
                    Details
                  </button>
                  <a
                    aria-disabled={booking.mapDisabled}
                    aria-label={`Navigate to ${booking.clientName}`}
                    className={booking.mapDisabled ? "disabled-map-link" : ""}
                    href={booking.mapDisabled ? undefined : booking.mapUrl}
                    rel="noreferrer"
                    target="_blank"
                    title={booking.mapDisabled ? "No address saved" : "Open navigation"}
                  >
                    <Send aria-hidden="true" size={18} strokeWidth={2.25} />
                  </a>
                </div>
              </article>
            ))
          ) : (
            <p>No bookings on this day.</p>
          )}
        </div>
      )}
    </article>
  );
}

export function AdminCalendarOverview({
  mode,
  monthOverview,
  onOpenBookingDetails,
  onSelectDate,
  onSelectMonth,
  renderMonthBookingCard,
  weekOverview,
  yearOverview,
}) {
  if (mode === "week") {
    return (
      <div className="admin-calendar-overview">
        <header className="admin-calendar-overview-heading admin-week-overview-heading">
          <div>
            <h3>{weekOverview.heading}</h3>
            <div className="admin-week-overview-summary" aria-label="Weekly summary">
              {weekOverview.summaryItems.map((item) => (
                <span key={item.id}>{item.label}</span>
              ))}
            </div>
          </div>
        </header>
        <div className="admin-week-overview-grid">
          {weekOverview.days.length > 0
            ? weekOverview.days.map((day) => renderOverviewDay(day, onSelectDate, onOpenBookingDetails))
            : <p className="admin-year-month-empty">No bookings recorded for this past week.</p>}
        </div>
      </div>
    );
  }

  if (mode === "month") {
    return (
      <div className="admin-calendar-overview">
        <header className="admin-calendar-overview-heading">
          <h3>{monthOverview.heading}</h3>
          <span>{monthOverview.bookingCountLabel}</span>
        </header>
        <div className="admin-month-overview-grid" aria-label={monthOverview.ariaLabel}>
          {monthOverview.weekdays.map((weekday) => <b key={weekday}>{weekday}</b>)}
          {monthOverview.days.length > 0
            ? monthOverview.days.map((day) => renderOverviewDay(day, onSelectDate, onOpenBookingDetails))
            : <p className="admin-year-month-empty">No bookings recorded for this past month.</p>}
        </div>
      </div>
    );
  }

  if (mode === "year") {
    return (
      <div className="admin-calendar-overview">
        <header className="admin-calendar-overview-heading">
          <h3>{yearOverview.heading}</h3>
          <span>{yearOverview.loadedBookingCountLabel}</span>
        </header>
        <div className="admin-year-overview-grid">
          {yearOverview.months.map((month) => (
            <button
              type="button"
              className={month.selected ? "admin-year-month-card selected-admin-year-month-card" : "admin-year-month-card"}
              key={month.firstDay}
              onClick={() => onSelectMonth(month.firstDay)}
            >
              <strong>{month.monthName}</strong>
              <span>{month.monthCount}</span>
              <small>bookings</small>
            </button>
          ))}
        </div>
        <section className="admin-year-month-bookings" aria-label={yearOverview.selectedMonth.ariaLabel}>
          <header>
            <div>
              <p>Selected month</p>
              <h4>{yearOverview.selectedMonth.label}</h4>
            </div>
            <span>{yearOverview.selectedMonth.bookingCountLabel}</span>
          </header>
          {yearOverview.selectedMonth.bookingCount > 0 ? (
            <div className="admin-year-month-booking-list">
              {yearOverview.selectedMonth.bookingDays.map((day) => (
                <section className="admin-year-month-booking-day" key={day.dateValue}>
                  <h5>{day.label}</h5>
                  <div>
                    {day.bookings.map((booking) => renderMonthBookingCard(booking))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="admin-year-month-empty">No bookings loaded for this month.</p>
          )}
        </section>
      </div>
    );
  }

  return null;
}
