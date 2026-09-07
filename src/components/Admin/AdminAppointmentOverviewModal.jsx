export function AdminAppointmentOverviewModal({
  activeTab,
  booking,
  defaultPersonalEventColor,
  editing,
  model,
  moreOpen,
  personalEventColors,
  updatePending,
  visibleMessage,
  onApproveCashRequest,
  onChangeClientName,
  onChangeEventColor,
  onChangeLocation,
  onChangePaymentMethod,
  onChangePaymentStatus,
  onChangePersonalEndTime,
  onChangeStartTime,
  onChangeTravelBuffer,
  onClose,
  onDuplicate,
  onMarkPaymentReceived,
  onRejectCashRequest,
  onRequestDelete,
  onSetTab,
  onShare,
  onToggleEditing,
  onToggleMoreOpen,
}) {
  if (!booking || !model) return null;

  return (
    <div className="admin-overview-backdrop" role="presentation">
      <section className="admin-overview-modal" role="dialog" aria-modal="true">
        <div className="admin-overview-heading">
          <div>
            <p>Booking overview</p>
            <h2>{model.headingTitle}</h2>
          </div>
          <div className="admin-overview-heading-actions">
            <button type="button" onClick={onToggleEditing}>
              {editing ? "Done" : "Edit"}
            </button>
            <div className="admin-more-menu-shell">
              <button type="button" onClick={onToggleMoreOpen}>More</button>
              {moreOpen && (
                <div className="admin-more-menu">
                  <button type="button" onClick={onShare}>Share appointment details</button>
                  {!model.isPersonalEvent && (
                    <button
                      type="button"
                      onClick={onDuplicate}
                    >
                      Duplicate
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-danger-option"
                    onClick={() => onRequestDelete("single", true)}
                  >
                    {model.isPersonalEvent ? "Delete this day" : "Delete"}
                  </button>
                  {model.showSeriesDelete && (
                    <button
                      type="button"
                      className="admin-danger-option"
                      onClick={() => onRequestDelete("series", true)}
                    >
                      Delete all days
                    </button>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="admin-overview-tabs">
          <button type="button" className={activeTab === "details" ? "active-overview-tab" : ""} onClick={() => onSetTab("details")}>Details</button>
          <button type="button" className={activeTab === "history" ? "active-overview-tab" : ""} onClick={() => onSetTab("history")}>History</button>
        </div>
        {activeTab === "details" ? (
          model.isPersonalEvent ? (
          <div className="admin-overview-content personal-event-overview-content">
            <div>
              <span>Title</span>
              {editing ? (
                <input value={model.personal.titleInputValue} onChange={(event) => onChangeClientName(event.target.value)} />
              ) : (
                <strong>{model.personal.titleLabel}</strong>
              )}
            </div>
            <div>
              <span>Date</span>
              <strong>{model.personal.dateLabel}</strong>
            </div>
            <div>
              <span>Start time</span>
              {editing ? (
                <input type="time" value={model.personal.startTimeInputValue} onChange={(event) => onChangeStartTime(event.target.value)} />
              ) : (
                <strong>{model.personal.startTimeLabel}</strong>
              )}
            </div>
            <div>
              <span>End time</span>
              {editing ? (
                <input
                  type="time"
                  value={model.personal.endTimeInputValue}
                  onChange={(event) => onChangePersonalEndTime(event.target.value)}
                />
              ) : (
                <strong>{model.personal.endTimeLabel}</strong>
              )}
            </div>
            <div>
              <span>Colour</span>
              {editing ? (
                <select value={model.personal.eventColorInputValue || defaultPersonalEventColor} onChange={(event) => onChangeEventColor(event.target.value)}>
                  {personalEventColors.map((color) => (
                    <option value={color.id} key={color.id}>{color.label}</option>
                  ))}
                </select>
              ) : (
                <strong>{model.personal.colorLabel}</strong>
              )}
            </div>
            <div>
              <span>Event range</span>
              <strong>{model.personal.seriesLabel}</strong>
            </div>
            <div className="overview-wide personal-event-actions">
              <span>Actions</span>
              <div>
                <button
                  type="button"
                  className="admin-danger-option"
                  onClick={() => onRequestDelete("single", false)}
                >
                  Delete this day
                </button>
                {model.showSeriesDelete && (
                  <button
                    type="button"
                    className="admin-danger-option"
                    onClick={() => onRequestDelete("series", false)}
                  >
                    Delete all days
                  </button>
                )}
              </div>
            </div>
            {visibleMessage && (
              <p className="overview-wide admin-action-message" role="status">
                {visibleMessage}
              </p>
            )}
          </div>
          ) : (
          <div className="admin-overview-content">
            <div>
              <span>Client</span>
              {editing ? (
                <input value={model.normal.clientInputValue} onChange={(event) => onChangeClientName(event.target.value)} />
              ) : (
                <strong>{model.normal.clientLabel}</strong>
              )}
            </div>
            <div>
              <span>Start time</span>
              {editing ? (
                <input type="time" value={model.normal.startTimeInputValue} onChange={(event) => onChangeStartTime(event.target.value)} />
              ) : (
                <strong>{model.normal.timeRangeLabel}</strong>
              )}
            </div>
            <div>
              <span>Buffer</span>
              {editing ? (
                <select value={model.normal.travelBufferInputValue} onChange={(event) => onChangeTravelBuffer(event.target.value)}>
                  {[15, 30, 45, 60, 90].map((minutes) => (
                    <option value={minutes} key={minutes}>{minutes} minutes</option>
                  ))}
                </select>
              ) : (
                <strong>{model.normal.travelBufferLabel}</strong>
              )}
            </div>
            <div>
              <span>Location</span>
              {editing ? (
                <input value={model.normal.locationInputValue} onChange={(event) => onChangeLocation(event.target.value)} />
              ) : (
                <strong>{model.normal.locationLabel}</strong>
              )}
            </div>
            <div><span>Contact</span><strong>{model.normal.contactLabel}</strong></div>
            <div>
              <span>{model.normal.paymentMethodFieldLabel}</span>
              {editing ? (
                <input value={model.normal.paymentMethodInputValue} onChange={(event) => onChangePaymentMethod(event.target.value)} />
              ) : (
                <strong>{model.normal.paymentMethodLabel}</strong>
              )}
            </div>
            <div>
              <span>{model.normal.paymentStatusFieldLabel}</span>
              {editing ? (
                <select
                  value={model.normal.paymentStatusInputValue}
                  onChange={(event) => onChangePaymentStatus(event.target.value)}
                >
                  <option value="awaiting_verification">Awaiting verification</option>
                  <option value="alternative_requested">Alternative requested</option>
                  <option value="cash_on_arrival">Payment on arrival</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              ) : (
                <strong>{model.normal.paymentStatusLabel}</strong>
              )}
            </div>
            {model.normal.detailRows.map((row) => (
              <div key={row.id}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
            {model.normal.showCashApprovalActions && (
              <div className="overview-wide payment-approval-actions">
                <span>Payment on arrival request</span>
                <div>
                  <button
                    type="button"
                    onClick={onApproveCashRequest}
                  >
                    Approve payment on arrival
                  </button>
                  <button
                    type="button"
                    className="admin-danger-option"
                    onClick={onRejectCashRequest}
                  >
                    Reject payment on arrival
                  </button>
                </div>
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={onMarkPaymentReceived}
                disabled={model.normal.markPaymentReceivedDisabled}
              >
                {model.normal.markPaymentReceivedLabel}
              </button>
            </div>
            {visibleMessage && (
              <p className="overview-wide admin-action-message" role="status">
                {visibleMessage}
              </p>
            )}
            <div className="overview-wide">
              <span>Services</span>
              {model.normal.serviceRows.map((item) => (
                <strong key={item.id}>{item.label}</strong>
              ))}
            </div>
          </div>
          )
        ) : (
          <div className="admin-overview-content">
            <div className="overview-wide">
              <span>History</span>
              {model.historyRows.map((row) => (
                <strong key={row.id}>{row.label}</strong>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
