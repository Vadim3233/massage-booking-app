import React from "react";
import massageTreatmentImage from "../../assets/massage-treatment-optimized.jpg";
import { minutesToTime } from "../../schedulingEngine.js";

export function BookingSummary({
  basketItems,
  basketTitle,
  bookingDurationMinutes,
  bookingTotal,
  checkoutAppointments,
  checkoutTotal,
  chosenDayLabel,
  goToAreaStep,
  removeServiceDuration,
  selectedArea,
  selectedEnhancementItems,
  selectedSlotLabel,
}) {
  const hasCheckoutAppointments = checkoutAppointments.length > 0;

  return (
    <aside className="booking-summary-panel">
      <img src={massageTreatmentImage} alt="" />
      <div className="booking-summary-body">
        {hasCheckoutAppointments ? (
          <>
            <h3>{checkoutAppointments.length} session{checkoutAppointments.length === 1 ? "" : "s"} reserved</h3>
            <div className="summary-appointment-stack">
              {checkoutAppointments.map((appointment, index) => (
                <article className="summary-appointment-card" key={appointment.id}>
                  <div className="summary-appointment-heading">
                    <span>Session {index + 1}</span>
                    <strong>{"\u00a3"}{appointment.total.toFixed(2)}</strong>
                  </div>
                  <div className="summary-appointment-meta">
                    <span>{appointment.dateLabel}</span>
                    <span>{minutesToTime(appointment.start)} - {minutesToTime(appointment.end)}</span>
                    <span>{appointment.selectedAreaName}</span>
                  </div>
                  <div className="summary-appointment-services">
                    {appointment.items.map((item) => (
                      <div key={`${appointment.id}-${item.id}`}>
                        <strong>{item.name}</strong>
                        <span>{Number(item.minutes) > 0 ? `${item.minutes} min` : item.price === 0 ? "Free" : `\u00a3${item.price}`}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {basketItems.length > 0 && (
              <div className="summary-current-draft">
                <strong>Current session draft</strong>
                <span>{basketItems.length} treatment{basketItems.length === 1 ? "" : "s"} selected, not added yet</span>
              </div>
            )}
            <div className="summary-total summary-grand-total">
              <span>Session total</span>
              <strong>{"\u00a3"}{checkoutTotal.toFixed(2)}</strong>
            </div>
          </>
        ) : (
          <>
            <h3>{basketTitle}</h3>
            <div className="summary-services">
              <span>Session details:</span>
              {basketItems.length > 0 ? (
                basketItems.map((service) => (
                  <div key={service.id}>
                    <button
                      type="button"
                      className="summary-remove-service"
                      aria-label={`Remove ${service.name}`}
                      onClick={() => removeServiceDuration(service.id)}
                    >
                      <span aria-hidden="true">X</span>
                    </button>
                    <strong>{service.name}</strong>
                    <span>{service.minutes} minutes</span>
                  </div>
                ))
              ) : (
                <small>No treatment selected yet</small>
              )}
              {selectedEnhancementItems.map((item) => (
                <div className="summary-enhancement-line" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{Number(item.durationMinutes) > 0 ? `+${item.durationMinutes} min` : item.price === 0 ? "Free" : `\u00a3${item.price}`}</span>
                </div>
              ))}
            </div>
            <div className="summary-line">
              <span>Area</span>
              {selectedArea ? (
                <strong>{selectedArea.name}</strong>
              ) : (
                <button type="button" className="summary-needed-value" onClick={goToAreaStep}>
                  Area needed
                </button>
              )}
            </div>
            <div className="summary-line"><span>Date</span><strong>{chosenDayLabel}</strong></div>
            <div className="summary-line"><span>Time</span><strong>{selectedSlotLabel}</strong></div>
            <div className="summary-line"><span>Duration</span><strong>{bookingDurationMinutes} minutes</strong></div>
            <div className="summary-total"><span>Total</span><strong>{"\u00a3"}{bookingTotal.toFixed(2)}</strong></div>
          </>
        )}
      </div>
    </aside>
  );
}
