export const CLIENT_BOOKING_INACTIVITY_MS = 20 * 60 * 1000;
export const CLIENT_BOOKING_MODAL_RESPONSE_MS = 2 * 60 * 1000;

export function shouldShowReservationInactivityModal({
  hasSelectedSlot,
  inactivityModalOpen,
  lastActivityAt,
  now,
}) {
  if (!hasSelectedSlot || inactivityModalOpen || !lastActivityAt) return false;
  return now - lastActivityAt >= CLIENT_BOOKING_INACTIVITY_MS;
}

export function shouldAutoReleaseReservation({
  inactivityModalOpen,
  modalOpenedAt,
  now,
}) {
  if (!inactivityModalOpen || !modalOpenedAt) return false;
  return now - modalOpenedAt >= CLIENT_BOOKING_MODAL_RESPONSE_MS;
}
