import assert from "node:assert/strict";
import {
  BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE,
  bookingHoldErrorMessage,
  CLIENT_BOOKING_LIMIT_MESSAGES,
} from "./bookingHoldErrors.js";

assert.equal(
  bookingHoldErrorMessage(new Error("Time slot is no longer available.")),
  "That time has just been taken or is currently being held. Please choose another time."
);

assert.equal(
  bookingHoldErrorMessage(new Error("A valid booking hold client key is required.")),
  "A valid booking hold client key is required."
);

assert.equal(
  bookingHoldErrorMessage(new Error("Booking could not be saved: CLIENT_NEW_CLIENT_ACTIVE_LIMIT")),
  CLIENT_BOOKING_LIMIT_MESSAGES.newClientLimit
);

assert.equal(
  bookingHoldErrorMessage(new Error("Booking could not be saved: You already have five upcoming appointments. Please manage one of those appointments before adding another.")),
  CLIENT_BOOKING_LIMIT_MESSAGES.returningClientLimit
);

assert.equal(
  bookingHoldErrorMessage(new Error("CLIENT_BOOKING_ADVANCE_LIMIT")),
  CLIENT_BOOKING_LIMIT_MESSAGES.advanceLimit
);

assert.equal(
  bookingHoldErrorMessage(new Error("Online appointments need at least 2 hours notice. Please choose a later time.")),
  CLIENT_BOOKING_LIMIT_MESSAGES.minimumNotice
);

assert.equal(
  bookingHoldErrorMessage(new Error("Booking could not be saved: unsupported SQL detail")),
  "Your appointment could not be confirmed. Please check your details and try again."
);

assert.equal(
  bookingHoldErrorMessage({
    code: "PGRST202",
    message: "Could not find the function public.create_booking_hold in the schema cache",
  }),
  BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE
);

assert.equal(
  bookingHoldErrorMessage(new Error("Booking could not be saved: Booking payload contains unsupported fields.")),
  BOOKING_SYSTEM_UPDATE_REQUIRED_MESSAGE
);

assert.equal(
  bookingHoldErrorMessage(null),
  "This time is no longer available. Please choose another."
);

console.log("Booking hold error tests passed.");
