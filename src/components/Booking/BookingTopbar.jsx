import React from "react";

export function BookingTopbar({
  bookingSteps,
  clientStep,
  currentStepIndex,
  currentStepLabel,
  mobileProgressOpen,
  onProgressToggle,
  onSelectStep,
  onStart,
  onSwitchAdmin,
}) {
  return (
    <header className={mobileProgressOpen ? "booking-topbar mobile-progress-open" : "booking-topbar"}>
      <button type="button" className="booking-logo" onClick={onStart} aria-label="Go to booking start">
        <span>VM</span>
        <strong>Vad Massage</strong>
      </button>
      <button
        type="button"
        className="mobile-progress-toggle"
        aria-expanded={mobileProgressOpen}
        onClick={onProgressToggle}
      >
        <span>{currentStepIndex + 1} of {bookingSteps.length}</span>
        <strong>{currentStepLabel}</strong>
      </button>
      <nav className="booking-progress" aria-label="Booking progress">
        {bookingSteps.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            className={clientStep === id ? "progress-step active-progress-step" : "progress-step"}
            onClick={() => onSelectStep(id)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="top-action-cluster">
        <button type="button" className="admin-link-button square-green-action" onClick={onSwitchAdmin}>
          <span aria-hidden="true" className="topbar-icon topbar-user-icon" />
          Admin
        </button>
      </div>
    </header>
  );
}
