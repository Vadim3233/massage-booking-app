import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function AdminAppointmentWizard({
  error,
  leaveConfirmationOpen,
  model,
  open,
  step,
  submitting,
  values,
  onBack,
  onCancelLeave,
  onChangeCustomerSearch,
  onChangeNewCustomerField,
  onChangeServiceDuration,
  onConfirmLeave,
  onEditReviewSection,
  onNext,
  onOpenPersonalEvent,
  onRemoveService,
  onSelectCustomer,
  onSelectDate,
  onSelectSlot,
  onShiftWeek,
  onSubmit,
  onSubmitNewCustomer,
  onToggleNewCustomer,
  onToggleService,
  onUnlockDate,
}) {
  if (!open) return null;

  return (
    <div className="admin-appointment-backdrop" role="presentation">
      <section className="admin-appointment-modal" role="dialog" aria-modal="true" aria-label="Create appointment">
        <header className="admin-appointment-header">
          <button
            type="button"
            aria-label={step === "services" || step === "review" ? "Close" : "Back"}
            onClick={onBack}
          >
            {step === "services" || step === "review" ? "x" : "<"}
          </button>
          <h2>
            {model.headings[step]}
          </h2>
          {step === "review" ? (
            <button type="button" className="appointment-create-button" disabled={!values.canCreate || submitting} onClick={onSubmit}>Create</button>
          ) : (
            <button
              type="button"
              className="appointment-next-button"
              disabled={values.nextDisabled}
              onClick={onNext}
            >
              Next
            </button>
          )}
        </header>

        {error && <p className="appointment-warning">{error}</p>}

        {step === "services" && (
          <div className="appointment-step appointment-service-step">
            <div className="appointment-summary-strip">
              {model.service.summaryItems.length === 0 ? (
                <span className="appointment-summary-empty">Selected services and total price here</span>
              ) : (
                <>
                  <div className="appointment-summary-lines">
                    {model.service.summaryItems.map((item) => (
                      <div className="appointment-summary-line" key={item.id}>
                        <strong>{item.name}</strong>
                        <span>{item.minutes} min</span>
                        <b>{"\u00a3"}{item.linePrice}</b>
                        <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemoveService(item)}>x</button>
                      </div>
                    ))}
                  </div>
                  <div className="appointment-summary-total">
                    <span>{model.service.duration} minutes</span>
                    <strong>Total {"\u00a3"}{model.service.total}</strong>
                  </div>
                </>
              )}
            </div>
            {model.service.showDurationWarning && (
              <p className="appointment-warning">Total appointment time must be 60 minutes minimum, then 30-minute steps.</p>
            )}
            <div className="appointment-service-list">
              {model.service.services.map((entry) => (
                <article className={entry.selected ? "appointment-service-card selected" : "appointment-service-card"} key={entry.service.id}>
                  <button type="button" className="appointment-service-main" onClick={() => onToggleService(entry.service, entry.selected)}>
                    <span style={{ background: entry.service.color }} />
                    <div>
                      <strong>{entry.service.name}</strong>
                      <small>{entry.service.shortDescription}</small>
                    </div>
                    <b>{entry.priceLabel}</b>
                  </button>
                  {entry.active && (
                    <div className="appointment-duration-controls">
                      {model.service.durationOptions.map((amount) => (
                        <button type="button" key={amount} onClick={() => onChangeServiceDuration(entry.service, amount)}>+{amount}</button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              <article className="appointment-service-card appointment-personal-event-card">
                <button type="button" className="appointment-service-main" onClick={onOpenPersonalEvent}>
                  <span className="appointment-personal-event-dot" />
                  <div>
                    <strong>Personal event</strong>
                    <small>Block time for breaks, travel, admin, or unavailable hours</small>
                  </div>
                  <b>Event</b>
                </button>
              </article>
            </div>
          </div>
        )}

        {step === "time" && (
          <div className="appointment-step appointment-time-step">
            <div className="appointment-month-row">
              <strong>{model.time.monthLabel}</strong>
              <span>{model.time.duration} min service / {model.time.travelBuffer} min buffer / admin override</span>
            </div>
            {model.time.dateLocked ? (
              <div className="appointment-locked-date">
                <span>Date selected from agenda</span>
                <strong>{model.time.lockedDateLabel}</strong>
                <button
                  type="button"
                  onClick={onUnlockDate}
                >
                  Change date
                </button>
              </div>
            ) : (
              <div className="appointment-week-row">
                <button
                  type="button"
                  className="appointment-week-shift"
                  aria-label="Previous week"
                  onClick={() => onShiftWeek(-7)}
                >
                  <ChevronLeft aria-hidden="true" size={18} />
                </button>
                <div className="appointment-date-row" aria-label="Choose appointment date">
                  {model.time.days.map((day) => (
                    <button
                      type="button"
                      className={day.selected ? "appointment-date-cell active" : "appointment-date-cell"}
                      key={day.day.id}
                      onClick={() => onSelectDate(day.day)}
                    >
                      <span>{day.shortLabel}</span>
                      <strong>{day.dayNumber}</strong>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="appointment-week-shift"
                  aria-label="Next week"
                  onClick={() => onShiftWeek(7)}
                >
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </div>
            )}
            <div className="appointment-slot-grid">
              {model.time.slots.length === 0 ? (
                <p className="appointment-warning">Choose a valid service length before selecting a time.</p>
              ) : (
                model.time.slots.map((slot) => (
                  <button
                    type="button"
                    className={slot.className}
                    key={`${model.time.dayId}-${slot.slot.start}`}
                    onClick={() => onSelectSlot(slot.slot)}
                  >
                    <span>{slot.startLabel}</span>
                    <small>{slot.slot.label}</small>
                    <b />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === "client" && (
          <div className="appointment-step appointment-client-step">
            <input
              className="appointment-search"
              type="search"
              placeholder="Search"
              value={values.customerSearch}
              onChange={(event) => onChangeCustomerSearch(event.target.value)}
            />
            <button
              type="button"
              className="appointment-add-customer"
              onClick={onToggleNewCustomer}
            >
              {model.client.addCustomerOpen ? "Close new customer" : "+ Add new customer"}
            </button>
            {model.client.addCustomerOpen && (
              <form className="appointment-new-customer-form" onSubmit={onSubmitNewCustomer}>
                {model.client.newCustomerFields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {field.type === "textarea" ? (
                      <textarea
                        placeholder={field.placeholder}
                        rows={field.rows}
                        value={field.value}
                        onChange={(event) => onChangeNewCustomerField(field.name, event.target.value)}
                      />
                    ) : (
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={field.value}
                        onChange={(event) => onChangeNewCustomerField(field.name, event.target.value)}
                        autoFocus={field.autoFocus}
                        required={field.required}
                      />
                    )}
                  </label>
                ))}
                <button type="submit">Save and select client</button>
              </form>
            )}
            <div className="appointment-customer-list">
              {model.client.customers.length === 0 ? (
                <p className="appointment-empty-state">No client found. Add a new customer above.</p>
              ) : model.client.customers.map((customer) => (
                <button
                  type="button"
                  className={customer.selected ? "appointment-customer-row selected" : "appointment-customer-row"}
                  key={customer.customer.id}
                  onClick={() => onSelectCustomer(customer.customer)}
                >
                  <span>{customer.initials}</span>
                  <strong>{customer.customer.name}</strong>
                  <b>{">"}</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="appointment-step appointment-review-step">
            <button
              type="button"
              className="appointment-review-service editable-appointment-review-item"
              onClick={() => onEditReviewSection("services", model.review.primaryServiceId)}
            >
              <span style={{ background: model.review.serviceAccent }} />
              <div>
                <small>Service</small>
                <strong>{model.review.serviceLabel}</strong>
                <b>{model.review.duration} min</b>
              </div>
              <em>Edit</em>
            </button>
            <div className="appointment-review-grid">
              {model.review.gridItems.map((item) => (
                <button type="button" className="editable-appointment-review-item" key={item.label} onClick={() => onEditReviewSection("services", model.review.primaryServiceId)}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <em>Edit</em>
                </button>
              ))}
            </div>
            {model.review.rows.map((row) => (
              <button type="button" className="appointment-review-row editable-appointment-review-item" key={row.label} onClick={() => onEditReviewSection(row.step, row.serviceId)}>
                <span>{row.icon}</span>
                <div>
                  <small>{row.label}</small>
                  <strong>{row.value}</strong>
                </div>
                <em>Edit</em>
              </button>
            ))}
          </div>
        )}

        {leaveConfirmationOpen && (
          <div className="appointment-leave-backdrop" role="presentation">
            <section className="appointment-leave-dialog" role="alertdialog" aria-modal="true" aria-label="Save changes before leaving">
              <h3>Save changes before leaving?</h3>
              <p>Unsaved changes will disappear forever.</p>
              <div>
                <button type="button" disabled={!values.canCreate} onClick={onCancelLeave}>Yes, save</button>
                <button type="button" onClick={onConfirmLeave}>Discard and leave</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
