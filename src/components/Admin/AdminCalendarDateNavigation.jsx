import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export function AdminCalendarDateNavigation({
  datePillItems,
  formatAdminMoney,
  formatAgendaDuration,
  isTodaySelected,
  monthLabel,
  onDatePillClick,
  onGoToToday,
  onShiftWeek,
  weekSummary,
}) {
  function renderAdminWeekDateControls() {
    return (
      <div className="admin-week-date-row">
        <button
          type="button"
          className="admin-week-nav-button"
          aria-label="Previous week"
          onClick={() => onShiftWeek(-7)}
        >
          <ChevronLeft aria-hidden="true" size={17} />
        </button>
        <div className="admin-week-date-pills">
          {datePillItems.map((day) => (
            <button
              type="button"
              className={[
                "admin-date-pill",
                day.isSelected ? "active-admin-date" : "",
                day.isToday ? "today-admin-date" : "",
              ].filter(Boolean).join(" ")}
              key={day.id}
              onClick={() => onDatePillClick(day.resolvedIndex, day.dateValue)}
              aria-pressed={day.isSelected}
            >
              <span className="admin-date-weekday-full">{day.label}</span>
              <span className="admin-date-weekday-short" aria-hidden="true">{day.shortWeekdayLabel}</span>
              <strong>
                <span className="admin-date-day-number">{day.dayNumberLabel}</span>
                <span className="admin-date-month-short"> {day.monthShortLabel}</span>
              </strong>
              <span className="admin-date-year">{day.yearShortLabel}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="admin-week-nav-button"
          aria-label="Next week"
          onClick={() => onShiftWeek(7)}
        >
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      </div>
    );
  }

  return (
      <div className="admin-date-strip" aria-label="Choose date">
        <p className="admin-date-strip-month">{monthLabel}</p>
        {renderAdminWeekDateControls()}
        <button
          type="button"
          className={isTodaySelected ? "admin-today-jump-button active-admin-today-jump" : "admin-today-jump-button"}
          onClick={onGoToToday}
        >
          <CalendarDays aria-hidden="true" size={15} strokeWidth={2} />
          Today
        </button>
        <div className="admin-week-summary-line" aria-label="Weekly summary">
          <span>{formatAdminMoney(weekSummary.revenue)} week</span>
          <span>{formatAgendaDuration(weekSummary.workMinutes)} work</span>
          <span>{formatAgendaDuration(weekSummary.travelMinutes)} travel</span>
          <span>{weekSummary.bookings} booking{weekSummary.bookings === 1 ? "" : "s"}</span>
        </div>
      </div>
  );
}
