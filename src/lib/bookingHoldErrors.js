export const CLIENT_BOOKING_LIMIT_MESSAGES = {
  advanceLimit: "Online appointments can currently be arranged up to 40 days ahead. Please choose an earlier date.",
  minimumNotice: "Online appointments need at least 2 hours notice. Please choose a later time.",
  newClientLimit: "Your first appointment is already reserved. Once it has been completed and paid, you'll be able to arrange future appointments more freely.",
  returningClientLimit: "You already have five upcoming appointments. Please manage one of those appointments before adding another.",
};

export const BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE =
  "I can't reserve this time because the booking system needs the latest database update. Please contact me directly while I finish the update.";

export function bookingHoldErrorMessage(error) {
  const message = String(error?.message || error || "").trim();
  const normalizedMessage = message.toLowerCase();
  if (
    message.includes(BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE) ||
    normalizedMessage.includes("create_booking_hold") ||
    normalizedMessage.includes("create_secure_booking") ||
    normalizedMessage.includes("booking hold update has not been applied") ||
    normalizedMessage.includes("booking hold system is unavailable") ||
    normalizedMessage.includes("session preferences table is unavailable") ||
    normalizedMessage.includes("schema cache")
  ) {
    return BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE;
  }
  if (message.includes(CLIENT_BOOKING_LIMIT_MESSAGES.newClientLimit) || message.includes("CLIENT_NEW_CLIENT_ACTIVE_LIMIT")) {
    return CLIENT_BOOKING_LIMIT_MESSAGES.newClientLimit;
  }
  if (message.includes(CLIENT_BOOKING_LIMIT_MESSAGES.returningClientLimit) || message.includes("CLIENT_RETURNING_ACTIVE_LIMIT")) {
    return CLIENT_BOOKING_LIMIT_MESSAGES.returningClientLimit;
  }
  if (message.includes(CLIENT_BOOKING_LIMIT_MESSAGES.advanceLimit) || message.includes("CLIENT_BOOKING_ADVANCE_LIMIT")) {
    return CLIENT_BOOKING_LIMIT_MESSAGES.advanceLimit;
  }
  if (message.includes(CLIENT_BOOKING_LIMIT_MESSAGES.minimumNotice) || message.includes("CLIENT_BOOKING_MINIMUM_NOTICE")) {
    return CLIENT_BOOKING_LIMIT_MESSAGES.minimumNotice;
  }
  if (message.includes("Time slot is no longer available")) {
    return "That time has just been taken or is currently being held. Please choose another time.";
  }
  if (message.includes("Booking payload contains unsupported fields")) {
    return BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE;
  }
  if (message.startsWith("Booking could not be saved:")) {
    return "Your appointment could not be confirmed. Please check your details and try again.";
  }
  return message || "This time is no longer available. Please choose another.";
}
