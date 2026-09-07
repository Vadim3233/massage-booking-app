import React from "react";
import { Activity, Clock3, Link2, X } from "lucide-react";

export function AdminPersonalEventModal({
  model,
  open,
  onCancel,
  onChangeColor,
  onChangeEndDate,
  onChangeEndTime,
  onChangeStartDate,
  onChangeStartTime,
  onChangeTitle,
  onSubmit,
}) {
  if (!open || !model) return null;

  return (
    <div className="admin-appointment-backdrop" role="presentation">
      <section className="admin-appointment-modal personal-event-modal" role="dialog" aria-modal="true" aria-label={model.ariaLabel ?? "Add personal event"}>
        <header className="admin-appointment-header">
          <button type="button" aria-label="Close" onClick={onCancel}>x</button>
          <h2>{model.heading ?? "Add personal event"}</h2>
          <button type="submit" form="personal-event-form" className="appointment-create-button">Create</button>
        </header>
        <form id="personal-event-form" className="personal-event-form" onSubmit={onSubmit}>
          <label>
            <span>Title</span>
            <input value={model.title} onChange={(event) => onChangeTitle(event.target.value)} placeholder="Personal event" />
          </label>
          <label>
            <span>Colour</span>
            <div className="personal-event-color-options">
              {model.colorOptions.map((color) => (
                <button
                  type="button"
                  aria-pressed={color.selected}
                  className={color.className}
                  key={color.id}
                  onClick={() => onChangeColor(color.id)}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </label>
          <div className="personal-event-grid">
            <label>
              <span>From date</span>
              <input
                type="date"
                value={model.startDate}
                onChange={(event) => onChangeStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>From time</span>
              <input type="time" value={model.startTime} onChange={(event) => onChangeStartTime(event.target.value)} />
            </label>
            <label>
              <span>Until date</span>
              <input type="date" value={model.endDate} min={model.startDate} onChange={(event) => onChangeEndDate(event.target.value)} />
            </label>
            <label>
              <span>Until time</span>
              <input type="time" value={model.endTime} onChange={(event) => onChangeEndTime(event.target.value)} />
            </label>
          </div>
          <p className="personal-event-help">Personal events block availability in the calendar, but they do not appear as client bookings.</p>
          {model.error && <p className="appointment-warning">{model.error}</p>}
        </form>
      </section>
    </div>
  );
}

export function AdminDeleteConfirmationDialog({
  model,
  target,
  onCancel,
  onConfirm,
}) {
  if (!target || !model) return null;

  return (
    <div className="appointment-leave-backdrop" role="presentation">
      <section className="appointment-leave-dialog" role="alertdialog" aria-modal="true" aria-label="Confirm appointment deletion">
        <h3>{model.title}</h3>
        <p>
          {model.message}
        </p>
        <div>
          <button type="button" className="admin-danger-option" onClick={onConfirm}>{model.confirmLabel}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

export function AdminDaySettingsSheet({
  model,
  open,
  scheduleModeDraft,
  workingHoursDraft,
  onChangeScheduleMode,
  onChangeWorkingHours,
  onClose,
  onSaveScheduleMode,
  onSaveWorkingHours,
  onToggleUnavailable,
  onUseWeeklySchedule,
}) {
  if (!open || !model) return null;

  return (
    <div className="day-settings-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="day-settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={model.ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="day-settings-sheet-handle" aria-hidden="true" />
        <header className="day-settings-sheet-header">
          <span className="day-settings-sheet-icon" aria-hidden="true">
            {model.type === "working-hours" ? <Clock3 size={28} strokeWidth={2.1} /> : <Link2 size={28} strokeWidth={2.1} />}
          </span>
          <div>
            <h2>{model.title}</h2>
            <p>{model.dateLabel}</p>
          </div>
          <button type="button" className="day-settings-sheet-close" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" size={22} strokeWidth={2.2} />
          </button>
        </header>

        {model.type === "working-hours" ? (
          <div className="day-settings-sheet-body">
            <label className="day-settings-toggle-card">
              <span>
                <strong>Use default working hours</strong>
                <small>Use your usual working hours</small>
              </span>
              <input
                type="checkbox"
                checked={workingHoursDraft.mode === "default" && !workingHoursDraft.markUnavailable}
                onChange={(event) =>
                  onChangeWorkingHours({
                    markUnavailable: false,
                    mode: event.target.checked ? "default" : "custom",
                  })
                }
              />
            </label>
            <label className="day-settings-toggle-card">
              <span>
                <strong>Custom working hours</strong>
                <small>Set custom hours for this day</small>
              </span>
              <input
                type="checkbox"
                checked={workingHoursDraft.mode === "custom" && !workingHoursDraft.markUnavailable}
                onChange={(event) =>
                  onChangeWorkingHours({
                    markUnavailable: false,
                    mode: event.target.checked ? "custom" : "default",
                  })
                }
              />
            </label>
            <div className={workingHoursDraft.mode === "custom" || workingHoursDraft.markUnavailable ? "day-settings-time-grid" : "day-settings-time-grid disabled-day-settings-grid"}>
              <label>
                <span>Start time</span>
                <select
                  value={workingHoursDraft.startTime}
                  disabled={workingHoursDraft.mode !== "custom" && !workingHoursDraft.markUnavailable}
                  onChange={(event) => onChangeWorkingHours({ startTime: event.target.value })}
                >
                  {model.timeOptions.map((time) => (
                    <option value={time} key={`working-start-${time}`}>{time}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>End time</span>
                <select
                  value={workingHoursDraft.endTime}
                  disabled={workingHoursDraft.mode !== "custom" && !workingHoursDraft.markUnavailable}
                  onChange={(event) => onChangeWorkingHours({ endTime: event.target.value })}
                >
                  {model.timeOptions.map((time) => (
                    <option value={time} key={`working-end-${time}`}>{time}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="day-settings-toggle-card">
              <span>
                <strong>Mark unavailable for this day</strong>
                <small>No appointments can be booked</small>
              </span>
              <input
                type="checkbox"
                checked={workingHoursDraft.markUnavailable}
                onChange={(event) => onToggleUnavailable(event.target.checked)}
              />
            </label>
            {model.error && <p className="day-settings-error" role="alert">{model.error}</p>}
            <div className="day-settings-sheet-actions">
              <button type="button" onClick={onClose} disabled={model.saving}>Cancel</button>
              <button type="button" className="admin-secondary-action" onClick={onUseWeeklySchedule} disabled={model.saving}>
                Use weekly schedule
              </button>
              <button type="button" className="admin-primary-action" onClick={onSaveWorkingHours} disabled={model.saving}>
                {model.saving ? "Saving..." : "Save for this date"}
              </button>
            </div>
          </div>
        ) : (
          <div className="day-settings-sheet-body">
            <p className="day-settings-helper">Choose scheduling behaviour for this day</p>
            <label className={scheduleModeDraft.mode === "optimized" ? "day-settings-choice active-day-settings-choice" : "day-settings-choice"}>
              <input
                type="radio"
                name="day-schedule-mode"
                checked={scheduleModeDraft.mode === "optimized"}
                onChange={() => onChangeScheduleMode({ mode: "optimized" })}
              />
              <span>
                <strong>Optimized chain mode <Link2 aria-hidden="true" size={16} strokeWidth={2.1} /></strong>
                <small>Show only times that connect well with the rest of the day</small>
              </span>
            </label>
            <label className={scheduleModeDraft.mode === "flexible" ? "day-settings-choice active-day-settings-choice" : "day-settings-choice"}>
              <input
                type="radio"
                name="day-schedule-mode"
                checked={scheduleModeDraft.mode === "flexible"}
                onChange={() => onChangeScheduleMode({ mode: "flexible" })}
              />
              <span>
                <strong>Flexible mode <Activity aria-hidden="true" size={16} strokeWidth={2.1} /></strong>
                <small>Allow any valid available time within working hours</small>
              </span>
            </label>
            <label className="day-settings-toggle-card">
              <span>
                <strong>Anchor start time (optional)</strong>
                <small>Set the first preferred start time if the day is empty</small>
              </span>
              <input
                type="checkbox"
                checked={scheduleModeDraft.anchorEnabled}
                onChange={(event) => onChangeScheduleMode({ anchorEnabled: event.target.checked })}
              />
            </label>
            <label className="day-settings-inline-time">
              <span>Anchor start</span>
              <select
                value={scheduleModeDraft.anchorStart}
                disabled={!scheduleModeDraft.anchorEnabled}
                onChange={(event) => onChangeScheduleMode({ anchorStart: event.target.value })}
              >
                {model.timeOptions.map((time) => (
                  <option value={time} key={`anchor-start-${time}`}>{time}</option>
                ))}
              </select>
            </label>
            {model.error && <p className="day-settings-error" role="alert">{model.error}</p>}
            <div className="day-settings-sheet-actions">
              <button type="button" onClick={onClose} disabled={model.saving}>Cancel</button>
              <button type="button" className="admin-secondary-action" onClick={onUseWeeklySchedule} disabled={model.saving}>
                Use weekly schedule
              </button>
              <button type="button" className="admin-primary-action" onClick={onSaveScheduleMode} disabled={model.saving}>
                {model.saving ? "Saving..." : "Save for this date"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
