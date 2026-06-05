import React from "react";
import {
  getBookingBlocks,
  getFlow,
  minutesToTime,
  timeToMinutes,
} from "../../schedulingEngine.js";

function formatRange(start, end) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

export function Timeline({ settings, bookings, previewSlots }) {
  const workingStart = timeToMinutes(settings.workingStart);
  const workingEnd = timeToMinutes(settings.workingEnd);
  const totalMinutes = Math.max(1, workingEnd - workingStart);
  const blocks = getBookingBlocks(bookings);
  const flow = getFlow(bookings);
  const hours = [];

  for (let marker = workingStart; marker <= workingEnd; marker += 60) {
    hours.push(marker);
  }

  function blockStyle(start, end) {
    return {
      left: `${((start - workingStart) / totalMinutes) * 100}%`,
      width: `${((end - start) / totalMinutes) * 100}%`,
    };
  }

  return (
    <section className="panel timeline-panel">
      <div className="section-heading">
        <p className="eyebrow">Calendar</p>
        <h2>Day flow</h2>
      </div>
      <div className="timeline-shell">
        <div className="time-ruler">
          {hours.map((hour) => (
            <span key={hour} style={{ left: `${((hour - workingStart) / totalMinutes) * 100}%` }}>
              {minutesToTime(hour)}
            </span>
          ))}
        </div>
        <div className="timeline-track" aria-label="Booking timeline">
          {flow.hasBookings && (
            <div className="flow-highlight" style={blockStyle(flow.flowStart, flow.flowEnd)}>
              Current flow
            </div>
          )}
          {blocks.map((booking) => (
            <React.Fragment key={booking.id}>
              <div className="booking-block" style={blockStyle(booking.start, booking.sessionEnd)}>
                <strong>{booking.serviceName}</strong>
                <span>{formatRange(booking.start, booking.sessionEnd)}</span>
              </div>
              {booking.travelBuffer > 0 && (
                <div className="buffer-block" style={blockStyle(booking.sessionEnd, booking.bufferEnd)}>
                  Travel buffer {booking.travelBuffer}m
                </div>
              )}
            </React.Fragment>
          ))}
          {previewSlots.map((slot) => (
            <div className="preview-block" key={`${slot.label}-${slot.start}`} style={blockStyle(slot.start, slot.bufferEnd)}>
              {slot.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

