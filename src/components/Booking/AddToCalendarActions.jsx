import { CalendarPlus } from "lucide-react";
import { buildIcs, calendarEventFromAppointment, calendarFileName, googleCalendarUrl } from "../../lib/calendarEvent.js";

function downloadCalendarFile(event) {
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = calendarFileName(event);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function AddToCalendarActions({ appointment, confirmed = false, location = "" }) {
  const event = calendarEventFromAppointment(
    { ...appointment, address: location || appointment?.address },
    { confirmed },
  );
  if (!event) return null;

  return (
    <div className="confirmation-calendar-actions">
      <div className="confirmation-calendar-buttons">
        <button type="button" onClick={() => downloadCalendarFile(event)}>
          <CalendarPlus aria-hidden="true" size={22} strokeWidth={1.8} />
          Add to calendar
        </button>
        <a className="confirmation-calendar-link" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
      </div>
      {!confirmed && (
        <p className="confirmation-calendar-note">
          It will show as awaiting confirmation until I have confirmed your booking.
        </p>
      )}
    </div>
  );
}
