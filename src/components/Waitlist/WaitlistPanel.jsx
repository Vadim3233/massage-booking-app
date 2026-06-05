import React from "react";
import {
  DEFAULT_TRAVEL_BUFFER,
  getSchedulingPreview,
  minutesToTime,
} from "../../schedulingEngine.js";

export function WaitlistPanel({
  days,
  displayDayName,
  getEffectiveWaitlistStatus,
  onCloseRequest,
  onSendOffer,
  services,
  slotMatchesWaitlistRequest,
  waitlistEntries,
}) {
  const visibleServices = services.filter((service) => service.visible);
  const activeEntries = waitlistEntries.filter((entry) => {
    const status = getEffectiveWaitlistStatus(entry);
    return status === "joined" || status === "offered";
  });
  const completedEntries = waitlistEntries.filter((entry) => {
    const status = getEffectiveWaitlistStatus(entry);
    return status === "accepted" || status === "closed";
  });

  function renderEntry(entry) {
    const effectiveStatus = getEffectiveWaitlistStatus(entry);
    const preferredDayIndex = Math.max(0, days.findIndex((day) => day.dateValue === entry.preferredDate || day.label === entry.preferredDate));
    const preferredDay = days[preferredDayIndex] ?? days[0];
    const preview = getSchedulingPreview({
      settings: preferredDay.settings,
      bookings: preferredDay.bookings,
      requestedDuration: entry.duration,
      requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
    });
    const matchingSlots = preview.slots.filter((slot) => slotMatchesWaitlistRequest(slot, entry));
    const selectedServiceId = entry.serviceId ?? visibleServices[0]?.id ?? services[0]?.id;
    const locked = effectiveStatus === "accepted" || effectiveStatus === "closed";

    return (
      <article className="waitlist-admin-card" key={entry.id}>
        <div className="waitlist-admin-main">
          <strong>{entry.clientName}</strong>
          <span>{displayDayName(days, entry.preferredDate)} / {entry.preferredWindow}</span>
          <small>{entry.preferenceType} / {entry.duration} minutes / flexibility +/- {entry.flexibility || 0} minutes</small>
          <b>{effectiveStatus}</b>
        </div>
        {effectiveStatus === "joined" && (
          <div className="waitlist-offer-actions">
            {matchingSlots.length === 0 ? (
              <p className="muted-copy">No matching slot yet</p>
            ) : (
              matchingSlots.map((slot) => (
                <div className="matching-offer" key={`${entry.id}-${slot.start}-${slot.bufferEnd}`}>
                  <span>This slot matches the request</span>
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    disabled={!selectedServiceId}
                    onClick={() =>
                      onSendOffer(entry.id, {
                        dayIndex: preferredDayIndex,
                        dayLabel: preferredDay.label,
                        serviceId: selectedServiceId,
                        slot,
                      })
                    }
                  >
                    Send offer: {minutesToTime(slot.start)}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {effectiveStatus === "offered" && entry.offeredSlot && (
          <p className="muted-copy">Offered {entry.offeredDayLabel} at {minutesToTime(entry.offeredSlot.start)}</p>
        )}
        {locked ? (
          <span className="waitlist-closed-note">Request closed</span>
        ) : (
          <button
            type="button"
            className="danger-button compact-button"
            onClick={() => onCloseRequest(entry.id)}
          >
            Close request
          </button>
        )}
      </article>
    );
  }

  return (
    <section className="panel waitlist-panel">
      <div className="section-heading">
        <p className="eyebrow">Waitlist</p>
        <h2>Manual requests</h2>
      </div>
      {waitlistEntries.length === 0 ? (
        <p className="muted-copy">No waitlist requests yet.</p>
      ) : (
        <>
          <div className="waitlist-group">
            <h3>Active</h3>
            <div className="waitlist-admin-list">
              {activeEntries.length === 0 ? <p className="muted-copy">No active waitlist requests.</p> : activeEntries.map(renderEntry)}
            </div>
          </div>
          <div className="waitlist-group">
            <h3>Completed</h3>
            <div className="waitlist-admin-list">
              {completedEntries.length === 0 ? <p className="muted-copy">No completed waitlist requests.</p> : completedEntries.map(renderEntry)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
