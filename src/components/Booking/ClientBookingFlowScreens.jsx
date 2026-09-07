import React from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  FileText,
  Mail,
  MapPin,
  Minus,
  Moon,
  Phone,
  Plus,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { BookAgainPanel } from "../Client/BookAgainPanel.jsx";
import { ClientAccountPanel } from "../Client/ClientAccountPanel.jsx";

export function ClientLocationStep({
  account,
  areaPickerRef,
  areaSelectionMessage,
  bookAgain,
  onBackToReview,
  onEmailLogin,
  onGoogleLogin,
  onMyBookings,
  onSelectArea,
  onSignOut,
  onToggleMoreAreas,
  returnToReviewAfterArea,
  serviceAreas,
  showMoreAreas,
  showMoreButton,
}) {
  return (
    <section className="booking-landing booking-location-screen">
      <div className="booking-hero-panel location-selection-panel">
        <div className="location-compact-header">
          <div className="location-brand-lockup" aria-label="VadMassage">
            <span className="location-brand-mark">VM</span>
            <strong>VadMassage</strong>
          </div>
          {returnToReviewAfterArea ? (
            <button type="button" className="premium-back-button" onClick={onBackToReview}>
              <ChevronLeft aria-hidden="true" size={22} strokeWidth={1.8} />
              Back to Review
            </button>
          ) : null}
          <span className="location-step-chip">Area</span>
        </div>
        <div className="location-copy">
          <h1>Choose your area</h1>
        </div>
        {bookAgain.show && (
          <BookAgainPanel
            clientName={bookAgain.clientName}
            favoriteSelection={bookAgain.favoriteSelection}
            lastSelection={bookAgain.lastSelection}
            loading={bookAgain.loading}
            onApply={bookAgain.onApply}
            recentSelections={bookAgain.recentSelections}
            usualSelection={bookAgain.usualSelection}
          />
        )}
        <div className="client-area-picker" ref={areaPickerRef}>
          {serviceAreas.length > 0 ? (
            serviceAreas.map((area) => (
              <button
                type="button"
                className={area.selected ? "client-area-option selected-client-area" : "client-area-option"}
                key={area.id}
                onClick={() => onSelectArea(area.id)}
              >
                <span className="client-area-option-main">
                  <span>{area.name}</span>
                  {area.congestionFeeLabel && (
                    <small className="client-area-fee-badge">
                      Congestion charge {area.congestionFeeLabel}
                    </small>
                  )}
                  {area.travelSurchargeLabel && (
                    <small className="client-area-fee-badge">
                      Travel surcharge {area.travelSurchargeLabel}
                    </small>
                  )}
                </span>
                <ChevronRight aria-hidden="true" className="client-area-chevron" size={30} strokeWidth={1.8} />
              </button>
            ))
          ) : (
            <p className="client-area-empty">Online booking areas are being updated. Please contact me directly.</p>
          )}
        </div>
        {showMoreButton && (
          <button
            type="button"
            className="show-more-areas-button"
            onClick={onToggleMoreAreas}
          >
            {showMoreAreas ? "Show Fewer Areas" : "Show More Areas"}
          </button>
        )}
        <p className="client-area-helper">
          I currently visit selected parts of these areas. If your address is just outside my usual route, please message me on WhatsApp or contact me directly and we can find a solution.
        </p>
        {areaSelectionMessage && (
          <p className="postcode-coverage-note postcode-coverage-outside">
            {areaSelectionMessage}
          </p>
        )}
        <p className="location-security-note">
          <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
          Your information is secure and private
        </p>
        <div className="account-actions">
          <ClientAccountPanel
            error={account.error}
            loading={account.loading}
            notice={account.notice}
            onEmailLogin={onEmailLogin}
            onGoogleLogin={onGoogleLogin}
            onMyBookings={onMyBookings}
            onSignOut={onSignOut}
            signingIn={account.signingIn}
            profile={account.profile}
            session={account.session}
          />
        </div>
      </div>
    </section>
  );
}

export function ClientTreatmentStep({
  onBack,
  onSelectTreatment,
  progress,
  treatments,
}) {
  return (
    <section className="booking-treatment-screen">
      <div className="treatment-selection-panel">
        <header className="premium-step-header">
          <button type="button" className="premium-back-button" onClick={onBack}>
            <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
            Back
          </button>
          <div className="premium-brand-lockup" aria-label="VadMassage">
            <span className="premium-brand-mark">VM</span>
            <strong>VadMassage</strong>
          </div>
        </header>
        {progress}
        <div className="treatment-copy">
          <p className="premium-section-label">Treatment</p>
          <h1>What would help you most today?</h1>
          <p>Choose the treatment that feels closest to what you need.</p>
        </div>
        <div className="premium-treatment-list">
          {treatments.length === 0 && (
            <div className="premium-empty-state">
              <strong>No treatments are currently available to book.</strong>
              <span>Please contact me directly and I will help you arrange a session.</span>
            </div>
          )}
          {treatments.map((service) => {
            const Icon = service.icon;

            return (
              <button
                type="button"
                className="premium-treatment-card"
                key={service.id}
                onClick={() => onSelectTreatment(service.id)}
              >
                <span className="premium-treatment-icon" aria-hidden="true">
                  <Icon size={34} strokeWidth={1.6} />
                </span>
                <span className="premium-treatment-copy">
                  <strong>{service.title}</strong>
                  <small>{service.description}</small>
                </span>
                <ChevronRight aria-hidden="true" className="premium-treatment-chevron" size={30} strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
        <p className="location-security-note treatment-security-note">
          <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
          Your information is secure and private
        </p>
      </div>
    </section>
  );
}

export function ClientDurationStep({
  continueReason,
  durationOptions,
  onAddDuration,
  onBack,
  onNext,
  onRemoveDuration,
  progress,
  valid,
}) {
  return (
    <section className="booking-duration-screen">
      <div className="duration-selection-panel">
        <header className="premium-step-header">
          <span className="premium-header-spacer" aria-hidden="true" />
          <div className="premium-brand-lockup" aria-label="VadMassage">
            <span className="premium-brand-mark">VM</span>
            <strong>VadMassage</strong>
          </div>
        </header>
        {progress}
        <div className="duration-copy">
          <p className="premium-section-label">Duration</p>
          <h1>How much time would you like?</h1>
          <p>Select the length of your session.</p>
        </div>
        <div className="premium-duration-list">
          {durationOptions.map((option) => (
            <div className="premium-duration-row" key={option.minutes}>
              <div className="premium-duration-copy">
                <strong>{option.label} <small>per person</small></strong>
                {option.priceLabel && (
                  <em>{option.priceLabel}</em>
                )}
                {option.badge && <span>{option.badge}</span>}
              </div>
              <div className="premium-duration-controls" aria-label={`${option.label} quantity`}>
                <button
                  type="button"
                  className="premium-duration-control"
                  aria-label={`Remove ${option.label}`}
                  onClick={() => onRemoveDuration(option.minutes)}
                  disabled={option.quantity === 0}
                >
                  <Minus aria-hidden="true" size={26} strokeWidth={2.4} />
                </button>
                <strong>{option.quantity}</strong>
                <button
                  type="button"
                  className="premium-duration-control add-duration-control"
                  aria-label={`Add ${option.label}`}
                  onClick={() => onAddDuration(option.minutes)}
                  disabled={option.addDisabled}
                >
                  <Plus aria-hidden="true" size={28} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {continueReason && <p className="booking-validation-message duration-validation-message">{continueReason}</p>}
        <footer className="premium-duration-footer duration-only-footer">
          <button
            type="button"
            className="premium-footer-back-button"
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
            Back
          </button>
          <button
            type="button"
            className="duration-next-button"
            disabled={!valid}
            title={continueReason}
            onClick={onNext}
          >
            Next
          </button>
          <p className="location-security-note duration-security-note">
            <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
            Your information is secure and private
          </p>
        </footer>
        </div>
    </section>
  );
}

export function ClientTimeStep({
  bookingDetailsOpen,
  bookingDetailsPanel,
  checkoutError,
  dateStripRef,
  dates,
  holdIsCreating,
  message,
  noSlotMessage,
  onBack,
  onNext,
  onOpenWaitlist,
  onScrollDates,
  onSelectDate,
  onSelectSlot,
  onToggleDetails,
  progress,
  canContinue,
  showFixedStartHint,
  showPrimaryWaitlistCta,
  slots,
  timeContinueReason,
}) {
  return (
    <section className="booking-time-screen">
      <div className="time-selection-panel">
        <header className="premium-step-header">
          <span className="premium-header-spacer" aria-hidden="true" />
          <div className="premium-brand-lockup" aria-label="VadMassage">
            <span className="premium-brand-mark">VM</span>
            <strong>VadMassage</strong>
          </div>
        </header>
        {progress}
        <div className="time-copy">
          <p className="premium-section-label">Date &amp; Time</p>
          <h1>Choose date and time</h1>
          <p>Choose a time that works well for your day.</p>
        </div>
        <div className="premium-date-carousel">
          <button
            type="button"
            className="premium-date-scroll-button"
            aria-label="Show earlier dates"
            onClick={() => onScrollDates(-1)}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <div className="premium-date-strip" aria-label="Select appointment date" ref={dateStripRef}>
            {dates.map((day) => (
              <button
                key={day.dateValue}
                type="button"
                className={day.selected ? "premium-date-card selected-premium-date-card" : "premium-date-card"}
                data-client-date-value={day.dateValue}
                onClick={() => onSelectDate(day)}
              >
                <span>{day.dayName}</span>
                <strong>{day.number}</strong>
                <small>{day.month}</small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="premium-date-scroll-button"
            aria-label="Show later dates"
            onClick={() => onScrollDates(1)}
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
        {showFixedStartHint && <p className="client-hint premium-time-hint">This day starts at a fixed first appointment time.</p>}
        <section className="premium-time-section" aria-label="Available times">
          <h2>Available Times</h2>
          {slots.length > 0 ? (
            <div className="premium-time-slot-grid">
              {slots.map((slot) => {
                const Icon = slot.evening ? Moon : Sun;

                return (
                  <button
                    key={slot.key}
                    type="button"
                    className={slot.selected ? "premium-time-slot selected-premium-time-slot" : "premium-time-slot"}
                    disabled={holdIsCreating}
                    onClick={() => onSelectSlot(slot.slot)}
                  >
                    <strong>{slot.label}</strong>
                    {slot.selected ? (
                      <span className="premium-time-check" aria-hidden="true">
                        <Check size={20} strokeWidth={2.4} />
                      </span>
                    ) : (
                      <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="premium-no-slot-card">
              <p>{noSlotMessage}</p>
              {showPrimaryWaitlistCta && (
                <button type="button" className="premium-waitlist-cta" onClick={onOpenWaitlist}>
                  Join the waitlist for this day
                </button>
              )}
            </div>
          )}
        </section>
        {message
          ? <p className="booking-validation-message">{message}</p>
          : timeContinueReason && <p className="booking-validation-message">{timeContinueReason}</p>}
        {slots.length > 0 && (
          <button type="button" className="premium-secondary-waitlist-cta" onClick={onOpenWaitlist}>
            Can't find a suitable time? Join the waiting list.
          </button>
        )}
        {checkoutError && <p className="booking-validation-message">{checkoutError}</p>}
        {holdIsCreating && <p className="booking-hold-message">Holding this time...</p>}
        {bookingDetailsPanel}
        <button
          type="button"
          className={bookingDetailsOpen ? "duration-details-button active-duration-details-button" : "duration-details-button"}
          aria-controls="premium-booking-details"
          aria-expanded={bookingDetailsOpen}
          onClick={onToggleDetails}
        >
          See details
          <ChevronDown aria-hidden="true" size={24} strokeWidth={2} />
        </button>
        <footer className="premium-time-footer">
          <button
            type="button"
            className="premium-footer-back-button"
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
            Back
          </button>
          <button
            type="button"
            className="time-next-button"
            disabled={!canContinue || holdIsCreating}
            title={timeContinueReason}
            onClick={onNext}
          >
            Next
            <ChevronRight aria-hidden="true" size={28} strokeWidth={1.8} />
          </button>
          <p className="location-security-note duration-security-note">
            <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
            Your information is secure and private
          </p>
        </footer>
      </div>
    </section>
  );
}

export function ClientDetailsStep({
  appointment,
  bookingDetailsOpen,
  bookingDetailsPanel,
  canContinue,
  contact,
  contactContinueReason,
  dev,
  onBack,
  onChangeAddress,
  onChangeContact,
  onChangeFullName,
  onFillTestClient,
  onNext,
  onToggleDetails,
  progress,
  showCheckoutWarning,
}) {
  return (
    <section className="booking-address-screen">
      <div className="address-selection-panel">
        <header className="premium-step-header">
          <span className="premium-header-spacer" aria-hidden="true" />
          <div className="premium-brand-lockup" aria-label="VadMassage">
            <span className="premium-brand-mark">VM</span>
            <strong>VadMassage</strong>
          </div>
        </header>
        {progress}
        <div className="address-copy">
          <p className="premium-section-label">Your Details</p>
          <h1>Your Details</h1>
          <p>Share the details I need for your visit.</p>
        </div>
        {dev && (
          <div className="dev-fill-client-helper">
            <button type="button" onClick={onFillTestClient}>
              Fill test client
            </button>
            <span>Development only</span>
          </div>
        )}
        <div className="premium-address-form">
          <label className="premium-address-field">
            <UserRound aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Full Name</strong>
              <input type="text" placeholder="Your full name" value={contact.nameInput} onChange={(event) => onChangeFullName(event.target.value)} />
            </span>
          </label>
          <label className="premium-address-field">
            <Mail aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Email Address</strong>
              <input type="email" placeholder="you@example.com" value={contact.email} onChange={(event) => onChangeContact("email", event.target.value)} />
            </span>
          </label>
          <label className="premium-address-field">
            <MapPin aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Street Address</strong>
              <input type="text" placeholder="123 Example Street" value={contact.streetAddress} onChange={(event) => onChangeAddress("streetAddress", event.target.value)} />
            </span>
          </label>
          <label className="premium-address-field">
            <Building2 aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Apartment, Suite, Unit (Optional)</strong>
              <input type="text" placeholder="Flat 4B" value={contact.apartment} onChange={(event) => onChangeAddress("apartment", event.target.value)} />
            </span>
          </label>
          <div className="premium-address-field-row">
            <label className="premium-address-field">
              <Building2 aria-hidden="true" size={25} strokeWidth={1.7} />
              <span>
                <strong>City</strong>
                <input type="text" placeholder="London" value={contact.city} onChange={(event) => onChangeAddress("city", event.target.value)} />
              </span>
            </label>
            <label className="premium-address-field">
              <Mail aria-hidden="true" size={25} strokeWidth={1.7} />
              <span>
                <strong>Postcode</strong>
                <input type="text" placeholder="SW3 4AA" value={contact.postcode} onChange={(event) => onChangeAddress("postcode", event.target.value)} />
              </span>
            </label>
          </div>
          <label className="premium-address-field">
            <DoorOpen aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Entry Instructions (Optional)</strong>
              <input type="text" placeholder="e.g. Use the side entrance, call on arrival" value={contact.entryInstructions} onChange={(event) => onChangeAddress("entryInstructions", event.target.value)} />
            </span>
          </label>
          <label className="premium-address-field">
            <Phone aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Contact Number</strong>
              <input type="tel" placeholder="+44 7123 456789" value={contact.phone} onChange={(event) => onChangeContact("phone", event.target.value)} />
            </span>
          </label>
          <label className="premium-address-field">
            <FileText aria-hidden="true" size={26} strokeWidth={1.7} />
            <span>
              <strong>Additional Notes (Optional)</strong>
              <input type="text" placeholder="Any additional notes for your therapist" value={contact.additionalNotes} onChange={(event) => onChangeAddress("additionalNotes", event.target.value)} />
            </span>
          </label>
        </div>
        <article className="premium-appointment-summary">
          <span className="premium-appointment-icon" aria-hidden="true">
            <CalendarDays size={34} strokeWidth={1.6} />
          </span>
          <div className="premium-appointment-copy">
            <strong>Your Appointment</strong>
            <p>{appointment.treatmentTitle} &bull; {appointment.durationMinutes} mins</p>
            <p>{appointment.timeLabel}</p>
            <p>{appointment.areaLabel}</p>
          </div>
        </article>
        {bookingDetailsPanel}
        {contactContinueReason && <p className="booking-validation-message">{contactContinueReason}</p>}
        {showCheckoutWarning && <p className="booking-validation-message">Review your appointment before checkout.</p>}
        <button
          type="button"
          className={bookingDetailsOpen ? "duration-details-button active-duration-details-button" : "duration-details-button"}
          aria-controls="premium-booking-details"
          aria-expanded={bookingDetailsOpen}
          onClick={onToggleDetails}
        >
          See details
          <ChevronDown aria-hidden="true" size={24} strokeWidth={2} />
        </button>
        <footer className="premium-address-footer">
          <button
            type="button"
            className="premium-footer-back-button"
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={26} strokeWidth={1.8} />
            Back
          </button>
          <button
            type="button"
            className="time-next-button"
            disabled={!canContinue}
            title={contactContinueReason}
            onClick={onNext}
          >
            Next
            <ChevronRight aria-hidden="true" size={28} strokeWidth={1.8} />
          </button>
          <p className="location-security-note duration-security-note">
            <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.8} />
            Your information is secure and private
          </p>
        </footer>
      </div>
    </section>
  );
}
