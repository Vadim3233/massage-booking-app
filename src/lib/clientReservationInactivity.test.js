import assert from "node:assert/strict";
import {
  CLIENT_BOOKING_INACTIVITY_MS,
  CLIENT_BOOKING_MODAL_RESPONSE_MS,
  shouldAutoReleaseReservation,
  shouldShowReservationInactivityModal,
} from "./clientReservationInactivity.js";

const start = Date.parse("2026-07-06T10:00:00.000Z");

assert.equal(
  shouldShowReservationInactivityModal({
    hasSelectedSlot: true,
    inactivityModalOpen: false,
    lastActivityAt: start,
    now: start + CLIENT_BOOKING_INACTIVITY_MS - 1,
  }),
  false,
  "does not show the inactivity modal before 20 minutes"
);

assert.equal(
  shouldShowReservationInactivityModal({
    hasSelectedSlot: true,
    inactivityModalOpen: false,
    lastActivityAt: start,
    now: start + CLIENT_BOOKING_INACTIVITY_MS,
  }),
  true,
  "shows the inactivity modal after 20 minutes"
);

assert.equal(
  shouldShowReservationInactivityModal({
    hasSelectedSlot: false,
    inactivityModalOpen: false,
    lastActivityAt: start,
    now: start + CLIENT_BOOKING_INACTIVITY_MS,
  }),
  false,
  "does not show the inactivity modal before a time is selected"
);

assert.equal(
  shouldAutoReleaseReservation({
    inactivityModalOpen: true,
    modalOpenedAt: start,
    now: start + CLIENT_BOOKING_MODAL_RESPONSE_MS - 1,
  }),
  false,
  "does not release before the 2-minute modal response window"
);

assert.equal(
  shouldAutoReleaseReservation({
    inactivityModalOpen: true,
    modalOpenedAt: start,
    now: start + CLIENT_BOOKING_MODAL_RESPONSE_MS,
  }),
  true,
  "auto-releases after the 2-minute modal response window"
);

assert.equal(
  shouldAutoReleaseReservation({
    inactivityModalOpen: false,
    modalOpenedAt: start,
    now: start + CLIENT_BOOKING_MODAL_RESPONSE_MS,
  }),
  false,
  "does not auto-release when the modal is closed"
);

console.log("clientReservationInactivity tests passed");
