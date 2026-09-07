import React, { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Clock3, Copy, MapPin, ReceiptText, Repeat2, X } from "lucide-react";
import { DEFAULT_DAY_SETTINGS, DEFAULT_TRAVEL_BUFFER, getSchedulingPreview, minutesToTime, timeToMinutes } from "../../schedulingEngine.js";
import { ClientEmailSignInForm } from "./ClientAccountPanel.jsx";
import {
  buildClientBookingDetailsViewModel,
  canClientCancelBooking,
  canClientRescheduleBooking,
  cancelCurrentClientBooking,
  rescheduleCurrentClientBooking,
} from "../../lib/clientData.js";
import { getFrontendBankTransferDetails } from "../../lib/bankTransferDetails.js";

const BANK_TRANSFER_CONFIGURATION = getFrontendBankTransferDetails(undefined, { labelStyle: "sentence" });
const BANK_TRANSFER_DETAILS = BANK_TRANSFER_CONFIGURATION.rows;

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "Date pending";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    year: "numeric",
  }).format(date);
}

function prettyStatus(value) {
  const text = String(value || "").trim();
  if (!text) return "Pending";
  return text
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCancelledClientBooking(booking = {}) {
  const status = String(booking.status || "").toLowerCase();
  const paymentStatus = String(booking.paymentStatus || booking.payment_status || "").toLowerCase();
  const cancellationLabel = String(booking.cancellationLabel || "").toLowerCase();
  return status.includes("cancel") || paymentStatus.includes("cancel") || cancellationLabel.includes("cancel");
}

function cancellationActorCardLabel(booking = {}) {
  const actor = String(booking.cancelledBy || booking.cancelled_by || "").trim().toLowerCase();
  if (actor === "client") return "Cancelled by you";
  if (actor === "admin" || actor === "therapist") return "Cancelled by therapist";
  return booking.cancellationLabel || "Cancelled";
}

function bookingStatusBadges(booking = {}) {
  if (isCancelledClientBooking(booking)) return [cancellationActorCardLabel(booking)];

  const labels = [
    booking.status ? prettyStatus(booking.status) : "",
    booking.paymentStatus ? prettyStatus(booking.paymentStatus) : "",
    booking.cancellationLabel || "",
  ].filter(Boolean);
  const seen = new Set();
  return labels.filter((label) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateValueFromDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDaysToDateValue(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValueFromDate(new Date());
  date.setDate(date.getDate() + days);
  return dateValueFromDate(date);
}

function buildDateWindow(startDateValue, count = 14) {
  return Array.from({ length: count }, (_, index) => addDaysToDateValue(startDateValue, index));
}

function bookingStartTime(booking = {}) {
  if (typeof booking.start === "string" && /^\d{2}:\d{2}$/.test(booking.start)) {
    return timeToMinutes(booking.start);
  }
  return Number(booking.startMinutes ?? booking.start_minutes ?? booking.start ?? 0);
}

function bookingDuration(booking = {}) {
  return Math.max(0, Number(booking.duration ?? booking.durationMinutes ?? booking.duration_minutes) || 0);
}

function bookingTravelBuffer(booking = {}) {
  return Math.max(0, Number(booking.travelBuffer ?? booking.travel_buffer ?? DEFAULT_TRAVEL_BUFFER) || DEFAULT_TRAVEL_BUFFER);
}

function isInactiveForAvailability(booking = {}) {
  const statusText = `${booking.status || ""} ${booking.paymentStatus || booking.payment_status || ""}`.toLowerCase();
  return statusText.includes("cancel")
    || statusText.includes("expired")
    || statusText.includes("refund")
    || statusText.includes("no-show")
    || statusText.includes("completed");
}

function schedulerBookingFromPortalBooking(booking = {}) {
  return {
    id: booking.id,
    start: bookingStartTime(booking),
    duration: bookingDuration(booking),
    travelBuffer: bookingTravelBuffer(booking),
    status: booking.status,
    paymentStatus: booking.paymentStatus,
  };
}

function calendarDayForDate(calendarDays = [], dateValue = "") {
  return calendarDays.find((day) => day.dateValue === dateValue) || null;
}

function bookingsForAvailability({
  allBookings = [],
  booking,
  calendarDays = [],
  dateValue,
}) {
  const day = calendarDayForDate(calendarDays, dateValue);
  const sourceBookings = Array.isArray(day?.bookings) && day.bookings.length > 0
    ? day.bookings
    : allBookings.filter((item) => item.dateValue === dateValue);

  return sourceBookings
    .filter((item) => item?.id !== booking?.id && !isInactiveForAvailability(item))
    .map(schedulerBookingFromPortalBooking)
    .filter((item) => Number.isFinite(item.start) && item.duration > 0);
}

function getDateCardParts(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "", number: "", month: "" };
  return {
    day: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
    month: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date),
    number: new Intl.DateTimeFormat("en-GB", { day: "2-digit" }).format(date),
  };
}

function friendlyRescheduleError(error) {
  const message = String(error?.message || "").trim();
  const lower = message.toLowerCase();
  if (lower.includes("24 hours")) {
    return "Online rescheduling is available up to 24 hours before your appointment. Please contact me directly.";
  }
  if (lower.includes("no longer available") || lower.includes("conflict")) {
    return "That time is no longer available. Please choose another time.";
  }
  if (lower.includes("signed-in") || lower.includes("belong")) {
    return "Please sign in again to reschedule this booking.";
  }
  if (lower.includes("cannot be rescheduled")) {
    return "This booking can’t be rescheduled online. Please contact me directly.";
  }
  return "I couldn’t reschedule this appointment just now. Please try again or contact me directly.";
}

function friendlyCancellationError(error) {
  const message = String(error?.message || "").trim().toLowerCase();
  if (message.includes("signed") || message.includes("auth") || message.includes("belong")) {
    return "Please sign in again to cancel this booking.";
  }
  if (message.includes("already cancelled") || message.includes("already canceled")) {
    return "This booking has already been cancelled.";
  }
  if (message.includes("cannot be cancelled") || message.includes("cannot be canceled") || message.includes("no longer")) {
    return "This booking can no longer be cancelled online. Please contact me directly.";
  }
  return "I couldn't cancel this booking just now. Please try again or contact me directly.";
}

function BookingCard({ actionLabel = "", booking, compact = false, onBookAgain, onViewDetails }) {
  return (
    <article className="my-booking-card">
      <div className="my-booking-card-main">
        <div className="my-booking-date-row">
          <span><CalendarDays aria-hidden="true" size={17} />{formatDate(booking.dateValue)}</span>
          {booking.time && <span><Clock3 aria-hidden="true" size={17} />{booking.time}</span>}
        </div>
        <h3>{booking.serviceName || "Massage appointment"}</h3>
        <p>{booking.duration ? `${booking.duration} minutes` : "Duration pending"}</p>
        {!compact && booking.address && (
          <p><MapPin aria-hidden="true" size={16} />{booking.address}</p>
        )}
        <div className="my-booking-status-row">
          {bookingStatusBadges(booking).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {booking.bookingReference && (
          <small><ReceiptText aria-hidden="true" size={15} />{booking.bookingReference}</small>
        )}
        <div className="my-booking-actions">
          <button type="button" className="my-booking-details-button" onClick={() => onViewDetails?.(booking)}>
            <ReceiptText aria-hidden="true" size={16} />
            View Details
          </button>
          {actionLabel && onBookAgain && (
            <button type="button" className="my-booking-book-again" onClick={() => onBookAgain(booking)}>
              <Repeat2 aria-hidden="true" size={16} />
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function BookingSection({ actionLabel = "", bookings = [], compact = false, onBookAgain, onViewDetails, title }) {
  return (
    <section className="my-bookings-section">
      <header>
        <h2>{title}</h2>
        <span>{bookings.length}</span>
      </header>
      {bookings.length > 0 ? (
        <div className="my-bookings-list">
          {bookings.map((booking) => (
            <BookingCard
              actionLabel={actionLabel}
              booking={booking}
              compact={compact}
              key={booking.id}
              onBookAgain={onBookAgain}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      ) : (
        <p className="my-bookings-section-empty">Nothing here yet.</p>
      )}
    </section>
  );
}

function DetailLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="my-booking-detail-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CopyButton({ copied, label, onCopy, value }) {
  return (
    <button
      type="button"
      aria-label={`Save ${label} to clipboard`}
      title={`Save ${label} to clipboard`}
      className={copied ? "copied-payment-button" : ""}
      onClick={() => onCopy(value, label)}
    >
      {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
    </button>
  );
}

function ReschedulePanel({
  allBookings,
  booking,
  calendarDays,
  eligibility,
  onRefreshBookings,
}) {
  const [selectedDate, setSelectedDate] = useState(() => booking.dateValue || dateValueFromDate(new Date()));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const dateWindow = useMemo(() => buildDateWindow(dateValueFromDate(new Date()), 30), []);

  const preview = useMemo(() => {
    const day = calendarDayForDate(calendarDays, selectedDate);
    const settings = day?.settings || DEFAULT_DAY_SETTINGS;
    return getSchedulingPreview({
      settings,
      bookings: bookingsForAvailability({ allBookings, booking, calendarDays, dateValue: selectedDate }),
      requestedDuration: bookingDuration(booking),
      requestedTravelBuffer: bookingTravelBuffer(booking),
    });
  }, [allBookings, booking, calendarDays, selectedDate]);

  const chosenDateLabel = formatDate(selectedDate);
  const chosenTimeLabel = selectedSlot ? minutesToTime(selectedSlot.start) : "";

  async function submitReschedule() {
    if (!selectedSlot || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      await rescheduleCurrentClientBooking({
        bookingId: booking.id,
        newDate: selectedDate,
        newStartMinutes: selectedSlot.start,
      });
      setMessage("Your appointment has been rescheduled.");
      await onRefreshBookings?.();
    } catch (error) {
      setMessage(friendlyRescheduleError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!eligibility.eligible) {
    return <p className="my-booking-reschedule-note">{eligibility.message}</p>;
  }

  return (
    <section className="my-booking-reschedule-panel" aria-label="Reschedule appointment">
      {!open ? (
        <button type="button" className="my-booking-reschedule-button" onClick={() => setOpen(true)}>
          <CalendarDays aria-hidden="true" size={16} />
          Reschedule
        </button>
      ) : (
        <>
          <header className="my-booking-reschedule-heading">
            <div>
              <p>Current appointment</p>
              <strong>{formatDate(booking.dateValue)} at {booking.time || minutesToTime(bookingStartTime(booking))}</strong>
            </div>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </header>

          <p className="my-booking-reschedule-note">
            Online rescheduling is available up to 24 hours before your appointment.
          </p>

          <div className="my-booking-reschedule-dates" aria-label="Choose new date">
            {dateWindow.map((dateValue) => {
              const parts = getDateCardParts(dateValue);
              return (
                <button
                  key={dateValue}
                  type="button"
                  className={dateValue === selectedDate ? "selected" : ""}
                  onClick={() => {
                    setSelectedDate(dateValue);
                    setSelectedSlot(null);
                    setMessage("");
                  }}
                >
                  <span>{parts.day}</span>
                  <strong>{parts.number}</strong>
                  <small>{parts.month}</small>
                </button>
              );
            })}
          </div>

          <div className="my-booking-reschedule-times" aria-label="Available reschedule times">
            {preview.slots.length > 0 ? preview.slots.map((slot) => (
              <button
                key={`${selectedDate}-${slot.start}`}
                type="button"
                className={selectedSlot?.start === slot.start ? "selected" : ""}
                onClick={() => {
                  setSelectedSlot(slot);
                  setMessage("");
                }}
              >
                <span>{minutesToTime(slot.start)}</span>
                {selectedSlot?.start === slot.start && <Check aria-hidden="true" size={16} />}
              </button>
            )) : (
              <p>No appointment availability is open for this date.</p>
            )}
          </div>

          {selectedSlot && (
            <div className="my-booking-reschedule-confirm">
              <p>Reschedule to {chosenDateLabel} at {chosenTimeLabel}?</p>
              <button type="button" disabled={submitting} onClick={submitReschedule}>
                {submitting ? "Rescheduling..." : "Confirm reschedule"}
              </button>
            </div>
          )}

          {message && <p className="my-booking-reschedule-message" role="status">{message}</p>}
        </>
      )}
    </section>
  );
}

function CancelBookingPanel({ booking, eligibility, onRefreshBookings }) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const blockedStatus = ["cancelled", "canceled", "completed", "expired", "no-show", "refunded"].includes(eligibility.code);

  async function submitCancellation() {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      await cancelCurrentClientBooking({ bookingId: booking.id });
      setMessage("Your booking has been cancelled. It will remain visible in My Bookings.");
      setConfirming(false);
      await onRefreshBookings?.();
    } catch (error) {
      setMessage(friendlyCancellationError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!eligibility.eligible) {
    if (message) return <p className="my-booking-cancel-message" role="status">{message}</p>;
    return blockedStatus ? null : <p className="my-booking-cancel-note">{eligibility.message}</p>;
  }

  return (
    <section className="my-booking-cancel-panel" aria-label="Cancel booking">
      {!confirming ? (
        <button type="button" className="my-booking-cancel-button" onClick={() => setConfirming(true)}>
          Cancel booking
        </button>
      ) : (
        <div className="my-booking-cancel-confirm">
          <div>
            <p>Cancel this booking?</p>
            <strong>{formatDate(booking.dateValue)} at {booking.time || minutesToTime(bookingStartTime(booking))}</strong>
            <span>{booking.serviceName || "Massage appointment"}</span>
          </div>
          <p>{eligibility.message}</p>
          <p>This will cancel your booking. It will remain visible in My Bookings.</p>
          <div className="my-booking-cancel-actions">
            <button type="button" onClick={() => setConfirming(false)} disabled={submitting}>
              Keep booking
            </button>
            <button type="button" onClick={submitCancellation} disabled={submitting}>
              {submitting ? "Cancelling..." : "Confirm cancellation"}
            </button>
          </div>
        </div>
      )}
      {message && <p className="my-booking-cancel-message" role="status">{message}</p>}
    </section>
  );
}

function BookingDetailsView({
  allBookings,
  booking,
  calendarDays,
  copiedKey,
  onClose,
  onCopy,
  onRefreshBookings,
  userId,
}) {
  const details = useMemo(
    () => buildClientBookingDetailsViewModel(booking, { userId }),
    [booking, userId]
  );
  const rescheduleEligibility = useMemo(
    () => canClientRescheduleBooking(booking, new Date(), { userId }),
    [booking, userId]
  );
  const cancelEligibility = useMemo(
    () => canClientCancelBooking(booking, new Date(), { userId }),
    [booking, userId]
  );

  if (!details) return null;

  return (
    <section className="my-booking-detail-view" aria-label="Booking details">
      <header className="my-booking-detail-header">
        <div>
          <p>Booking details</p>
          <h2>{details.serviceName}</h2>
          <span>{details.statusLabel}</span>
        </div>
        <button type="button" aria-label="Close booking details" onClick={onClose}>
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      <div className="my-booking-detail-grid">
        <DetailLine label="Booking" value={details.statusLabel} />
        <DetailLine label="Payment" value={details.paymentStatusLabel} />
        <DetailLine label="Booking reference" value={details.bookingReference} />
        <DetailLine label="Service" value={details.serviceName} />
        <DetailLine label="Duration" value={details.durationLabel} />
        <DetailLine label="Date" value={details.dateLabel} />
        <DetailLine label="Time" value={details.time} />
        <DetailLine label="Area" value={details.area} />
        <DetailLine label="Full address" value={details.address} />
        <DetailLine label="Name" value={details.clientName} />
        <DetailLine label="Email" value={details.clientEmail} />
        <DetailLine label="Phone" value={details.clientPhone} />
        {details.sessionPreferences?.length > 0 && (
          <DetailLine label="Session preferences" value={details.sessionPreferences.join(", ")} />
        )}
        {details.sessionNotes && (
          <DetailLine label="Client note" value={details.sessionNotes} />
        )}
        <DetailLine label="Payment method" value={details.paymentMethodLabel} />
        <DetailLine label="Amount" value={details.amountLabel} />
        <DetailLine label="Confirmation email" value={details.confirmationEmail} />
        <DetailLine label="Cancelled at" value={details.cancelledAtLabel} />
        <DetailLine label="Cancelled by" value={details.cancelledByLabel} />
        <DetailLine label="Cancellation type" value={details.cancellationWindowLabel} />
      </div>

      {details.bankTransferRelevant && (
        <section className="my-booking-bank-details" aria-label="Bank transfer details">
          <div className="my-booking-bank-heading">
            <h3>Payment details</h3>
            <p>Use these details if you still need to complete the bank transfer.</p>
          </div>
          <div className="my-booking-bank-grid">
            <div className="my-booking-bank-row">
              <span>Amount</span>
              <strong>{details.amountLabel}</strong>
            </div>
            <div className="my-booking-bank-row">
              <span>Payment reference</span>
              <strong>{details.paymentReference || details.bookingReference}</strong>
              <CopyButton
                copied={copiedKey === "payment-reference"}
                label="payment-reference"
                onCopy={onCopy}
                value={details.paymentReference || details.bookingReference}
              />
            </div>
            {BANK_TRANSFER_CONFIGURATION.isConfigured ? (
              BANK_TRANSFER_DETAILS.map((detail) => (
                <div className="my-booking-bank-row" key={detail.key}>
                  <span>{detail.label}</span>
                  <strong>{detail.value}</strong>
                  <CopyButton
                    copied={copiedKey === detail.key}
                    label={detail.key}
                    onCopy={onCopy}
                    value={detail.value}
                  />
                </div>
              ))
            ) : (
              <p className="my-booking-reschedule-note">{BANK_TRANSFER_CONFIGURATION.message}</p>
            )}
          </div>
        </section>
      )}

      <ReschedulePanel
        allBookings={allBookings}
        booking={booking}
        calendarDays={calendarDays}
        eligibility={rescheduleEligibility}
        key={booking.id}
        onRefreshBookings={onRefreshBookings}
      />
      <CancelBookingPanel
        booking={booking}
        eligibility={cancelEligibility}
        onRefreshBookings={onRefreshBookings}
      />
    </section>
  );
}

export function MyBookingsPanel({
  calendarDays = [],
  error = "",
  groupedBookings,
  loading = false,
  onBackToBooking,
  onBookAgain,
  onBookMassage,
  onEmailLogin,
  onGoogleLogin,
  onRefreshBookings,
  notice = "",
  session,
  signingIn = false,
}) {
  const [copiedKey, setCopiedKey] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState("");

  async function copyDetailText(value, key) {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1400);
    } catch {
      setCopiedKey("");
    }
  }

  if (!session?.user) {
    return (
      <section className="my-bookings-panel">
        <header className="my-bookings-hero">
          <p>Your appointments</p>
          <h1>My Bookings</h1>
          <span>Sign in to view appointments saved to your client account.</span>
        </header>
        <div className="my-bookings-navigation" aria-label="My bookings navigation">
          <button type="button" className="my-bookings-back-button" onClick={onBackToBooking}>
            <ChevronLeft aria-hidden="true" size={18} />
            Back to booking
          </button>
          <button type="button" className="my-bookings-new-button" onClick={onBookMassage}>
            <CalendarDays aria-hidden="true" size={18} />
            New booking
          </button>
        </div>
        <div className="my-bookings-empty-state">
          <p>You don't have any saved bookings yet.</p>
          <ClientEmailSignInForm onEmailLogin={onEmailLogin} signingIn={signingIn} />
          <button type="button" className="google-login-button" onClick={onGoogleLogin} disabled={signingIn}>
            <span className="google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>
          {notice && <small role="status">{notice}</small>}
          {error && <small role="alert">{error}</small>}
        </div>
      </section>
    );
  }

  const upcoming = groupedBookings?.upcoming || [];
  const past = groupedBookings?.past || [];
  const cancelled = groupedBookings?.cancelled || [];
  const total = upcoming.length + past.length + cancelled.length;
  const allBookings = [...upcoming, ...past, ...cancelled];
  const selectedBooking = allBookings.find((booking) => booking.id === selectedBookingId) || null;

  return (
    <section className="my-bookings-panel">
      <header className="my-bookings-hero">
          <p>Your appointments</p>
        <h1>My Bookings</h1>
        <span>Appointments saved to your client account.</span>
      </header>
      <div className="my-bookings-navigation" aria-label="My bookings navigation">
        <button type="button" className="my-bookings-back-button" onClick={onBackToBooking}>
          <ChevronLeft aria-hidden="true" size={18} />
          Back to booking
        </button>
        <button type="button" className="my-bookings-new-button" onClick={onBookMassage}>
          <CalendarDays aria-hidden="true" size={18} />
          New booking
        </button>
      </div>

      {loading ? (
        <p className="my-bookings-loading" role="status">Getting your appointments...</p>
      ) : total === 0 ? (
        <div className="my-bookings-empty-state">
          <p>You don't have any saved bookings yet.</p>
          <button type="button" className="outline-action" onClick={onBookMassage}>Book a massage</button>
        </div>
      ) : (
        <>
          {selectedBooking && (
            <BookingDetailsView
              allBookings={allBookings}
              booking={selectedBooking}
              calendarDays={calendarDays}
              copiedKey={copiedKey}
              onClose={() => setSelectedBookingId("")}
              onCopy={copyDetailText}
              onRefreshBookings={onRefreshBookings}
              userId={session.user.id}
            />
          )}
          <BookingSection actionLabel="Book similar session" bookings={upcoming} onBookAgain={onBookAgain} onViewDetails={(booking) => setSelectedBookingId(booking.id)} title="Upcoming" />
          <BookingSection actionLabel="Book Again" bookings={past} compact onBookAgain={onBookAgain} onViewDetails={(booking) => setSelectedBookingId(booking.id)} title="Past" />
          <BookingSection bookings={cancelled} compact onViewDetails={(booking) => setSelectedBookingId(booking.id)} title="Cancelled" />
        </>
      )}

      {error && <p className="client-account-error" role="alert">{error}</p>}
    </section>
  );
}
