import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bookingToSupabasePayload,
  normalizeAdminBookingApprovalPatch,
  paymentMethodToBookingStatus,
  paymentMethodToPaymentStatus,
} from "./lib/bookingPersistence.js";
import { buildAdminTelegramMessage, friendlyPaymentStatus } from "../server/telegramProvider.js";
import { emailTemplates } from "../server/emailTemplates.js";
import { buildClientAuthRedirectUrl, normalizePublicAppUrl } from "./lib/authRedirect.js";

const BANK_ENV_KEYS = ["BANK_ACCOUNT_NAME", "BANK_NAME", "BANK_SORT_CODE", "BANK_ACCOUNT_NUMBER"];
const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const clientBookingFlowScreensSource = readFileSync(new URL("./components/Booking/ClientBookingFlowScreens.jsx", import.meta.url), "utf8");
const telegramLinksSource = readFileSync(new URL("./lib/telegramLinks.js", import.meta.url), "utf8");

// Test 0: Client booking revalidation helper stays module-scoped for the payment flow.
{
  const helperIndex = appSource.indexOf("function getClientBookablePreviewForDay");
  const clientInterfaceIndex = appSource.indexOf("function ClientBookingInterface");
  const confirmationIndex = appSource.indexOf("async function confirmClientBooking");

  assert.ok(helperIndex >= 0, "Client bookable preview helper should exist");
  assert.ok(clientInterfaceIndex >= 0, "Client booking interface should exist");
  assert.ok(confirmationIndex >= 0, "Client confirmation flow should exist");
  assert.ok(helperIndex < clientInterfaceIndex, "Client bookable preview helper should be module-scoped");
  assert.ok(helperIndex < confirmationIndex, "Client confirmation flow should be able to call the helper");
}

// Test 0b: Availability remains public; Stage 2 hold mutations use authenticated sessions.
{
  assert.match(appSource, /async function loadPublicAvailabilityFromSupabase\(days\) {\s*const supabase = await getPublicSupabaseClient\(\);/);
  assert.match(appSource, /async function createBookingHoldInSupabase\(\{ dateValue, slot \}\) {\s*const supabase = await getSupabaseClient\(\);/);
  assert.match(appSource, /async function releaseBookingHoldInSupabase\(hold\) {[\s\S]*const supabase = await getSupabaseClient\(\);/);
}

// Test 0c: Public client enhancements use the persisted catalogue and omit hidden entries.
{
  assert.match(appSource, /const publicClientEnhancements = getClientEnhancements\(enhancements\);/);
  assert.match(appSource, /getClientEnhancements/);
  assert.match(appSource, /<ClientBookingInterface[\s\S]*enhancements=\{publicClientEnhancements\}/);
}

// Test 0d: Mobile preview payment confirmation stays local and never saves preview holds.
{
  const confirmationIndex = appSource.indexOf("async function confirmClientBooking");
  const paymentSubmitIndex = appSource.indexOf("async function confirmPayment");
  const previewIndex = appSource.indexOf("if (isMobilePreviewFrame)", confirmationIndex);
  const orderIndex = appSource.indexOf("await createOrderInSupabase", confirmationIndex);
  const saveIndex = appSource.indexOf("await addBookingToDay", confirmationIndex);
  const paymentSubmitEndIndex = appSource.indexOf("function handleConfirmedAppointmentAction", paymentSubmitIndex);
  const prerequisiteIndex = appSource.indexOf("function firstClientStepForMissingPrerequisite");
  const cancelIndex = appSource.indexOf("async function cancelConfirmedBookingByMistake");
  const previewCancelIndex = appSource.indexOf("if (isMobilePreviewFrame)", cancelIndex);
  const realCancelIndex = appSource.indexOf("cancelRecentBookingRequestInSupabase", cancelIndex);

  assert.ok(previewIndex > confirmationIndex, "Mobile preview confirmation branch should exist");
  assert.ok(previewIndex < orderIndex, "Mobile preview should not create a real payment order");
  assert.ok(previewIndex < saveIndex, "Mobile preview should not save a real booking");
  assert.match(appSource.slice(previewIndex, orderIndex), /return \{ appointments: previewAppointments, previewOnly: true \};/);
  assert.match(appSource.slice(paymentSubmitIndex, paymentSubmitEndIndex), /setConfirmedAppointments\(confirmedList\);[\s\S]*setClientStep\("payment"\);/);
  assert.match(appSource.slice(prerequisiteIndex, prerequisiteIndex + 400), /targetStep === "payment" && confirmedAppointments\.length > 0/);
  assert.match(appSource, /normalizeClientPortalBooking/);
  assert.match(appSource, /function confirmedAppointmentToClientPortalBooking\(appointment = \{\}, userId = ""\)/);
  assert.match(appSource, /function mergeClientPortalBookings\(serverBookings = \[\], optimisticBookings = \[\]\)/);
  assert.match(appSource, /const optimisticBookings = confirmedAppointments[\s\S]*confirmedAppointmentToClientPortalBooking\(appointment, clientSession\.user\.id\)/);
  assert.match(appSource, /setMyBookingsGrouped\(groupClientPortalBookings\(mergeClientPortalBookings\(bookings, optimisticBookings\)\)\)/);
  assert.match(appSource, /setMyBookingsGrouped\(\(current\) => groupClientPortalBookings\(mergeClientPortalBookings/);
  assert.ok(previewCancelIndex > cancelIndex, "Mobile preview cancellation branch should exist");
  assert.ok(previewCancelIndex < realCancelIndex, "Mobile preview should not call real cancellation RPC");
}

// Test 0e: Available Date & Time slots still offer a secondary waitlist path.
{
  assert.match(appSource, /<ClientTimeStep[\s\S]*slots=\{clientTimeSlots\}/);
  assert.match(appSource, /showPrimaryWaitlistCta=\{clientPreview\.warnings\.length === 0\}/);
  assert.match(clientBookingFlowScreensSource, /className="premium-secondary-waitlist-cta"[\s\S]*Can't find a suitable time\? Join the waiting list\./);
  assert.match(clientBookingFlowScreensSource, /className="premium-waitlist-cta"[\s\S]*Join the waitlist for this day/);
}

// Test 0f: Client waitlist uses an optional progressive time preference control.
{
  assert.match(appSource, /const WAITLIST_NO_PREFERENCE = "No preference";/);
  assert.match(appSource, /const WAITLIST_DATE_MODE_OPTIONS = \[[\s\S]*One preferred date[\s\S]*A date range[\s\S]*Any suitable date/);
  assert.match(appSource, /const WAITLIST_TIME_MODE_OPTIONS = \[[\s\S]*value: "none", label: WAITLIST_NO_PREFERENCE[\s\S]*value: "exact", label: "At a specific time"[\s\S]*value: "window", label: "Within a time range"/);
  assert.match(appSource, /const WAITLIST_TIME_OPTIONS = Array\.from\([\s\S]*minutesToTime\(9 \* 60 \+ index \* 30\)/);
  assert.match(appSource, /const WAITLIST_RANGE_FROM_OPTIONS = WAITLIST_TIME_OPTIONS\.slice\(0, -1\);/);
  assert.match(appSource, /clientStep === "time" && waitlistFormOpen/);
  assert.match(appSource, /className="booking-time-screen waitlist-request-screen"/);
  assert.match(appSource, /className="waitlist-request-form"/);
  assert.match(appSource, /<span>Date preference<\/span>/);
  assert.match(appSource, /<span>When would suit you\?<\/span>/);
  assert.match(appSource, /<span>Email address<\/span>/);
  assert.match(appSource, /<span>Phone number<\/span>/);
  assert.match(appSource, /Add either email or phone\. You can add both if you like\./);
  assert.match(appSource, /<span>Notes<\/span>/);
  assert.match(appSource, /Anything you would like me to know\?/);
  assert.match(appSource, /Please add an email address or phone number so I can contact you\./);
  assert.match(appSource, /Choose when you'd like the appointment to start\./);
  assert.match(appSource, /waitlistForm\.preferredWindow !== WAITLIST_NO_PREFERENCE && waitlistForm\.preferenceType === "exact" && \(/);
  assert.match(appSource, /waitlistForm\.preferredWindow !== WAITLIST_NO_PREFERENCE && waitlistForm\.preferenceType === "window" && \(/);
  assert.match(appSource, /<span>Preferred start time<\/span>/);
  assert.match(appSource, /className="waitlist-time-range-group"/);
  assert.match(appSource, /<span>Earliest start<\/span>/);
  assert.match(appSource, /<span>Latest start<\/span>/);
  assert.match(appSource, /Back to times/);
  assert.match(appSource, /Join waiting list/);
  assert.match(appSource, /Please choose a time range where To is later than From\./);
  assert.match(appSource, /Please choose an end date after the start date\./);
  assert.match(appSource, /preferredWindow: buildWaitlistPreferredWindow\(waitlistForm\)|const preferredWindow = buildWaitlistPreferredWindow\(waitlistForm\)/);
  assert.match(appSource, /datePreferenceType: waitlistForm\.datePreferenceType/);
  assert.match(appSource, /email: waitlistForm\.email\.trim\(\) \|\| contact\.email \|\| ""/);
  assert.match(appSource, /phone: waitlistForm\.phone\.trim\(\) \|\| contact\.phone \|\| ""/);
  assert.match(appSource, /notes: waitlistForm\.notes\.trim\(\)/);
  assert.match(appSource, /preferredDateEnd: waitlistForm\.datePreferenceType === "range" \? waitlistForm\.preferredDateEnd : ""/);
  assert.match(appSource, /preferredWindowEnd: waitlistForm\.preferenceType === "window" \? waitlistForm\.preferredWindowEnd : ""/);
  assert.match(appSource, /preferredWindow: WAITLIST_NO_PREFERENCE/);
  assert.match(appSource, /if \(!entry\.preferredWindow \|\| entry\.preferredWindow === WAITLIST_NO_PREFERENCE\) return true;/);
  assert.match(appSource, /<ClientTimeStep[\s\S]*slots=\{clientTimeSlots\}/);
  assert.doesNotMatch(appSource, /From a time/);
}

// Test 0g: Area helper asks out-of-route clients to contact directly first.
{
  assert.match(clientBookingFlowScreensSource, /please message me on WhatsApp or contact me directly and we can find a solution\./);
  assert.doesNotMatch(appSource, /I will contact you before confirming your appointment\./);
}

// Test 0h: Confirmation page explains optional Telegram setup after booking.
{
  assert.match(appSource, /const CLIENT_TELEGRAM_BOT_URL = normalizeTelegramBotUrl\(import\.meta\.env\.VITE_TELEGRAM_BOT_URL\);/);
  assert.match(appSource, /const confirmationTelegramUrl = clientTelegramConnected \? "" : buildTelegramStartUrl\(CLIENT_TELEGRAM_BOT_URL, confirmedPaymentReference\);/);
  assert.match(appSource, /get_my_telegram_connection/);
  assert.match(appSource, /Telegram is already connected to your client account\./);
  assert.match(telegramLinksSource, /export function normalizeTelegramBotUrl\(value\)/);
  assert.ok(telegramLinksSource.includes('url.pathname = url.pathname.replace(/^\\/@/, "/");'));
  assert.match(telegramLinksSource, /url\.searchParams\.set\("start", startPayload\)/);
  assert.match(telegramLinksSource, /export function telegramStartPayloadFromMessageText\(text\)/);
  assert.match(appSource, /<h2>Telegram updates<\/h2>/);
  assert.match(appSource, /Email remains the main place for your confirmation and reminder\./);
  assert.match(appSource, /confirmation-telegram-start/);
  assert.match(appSource, /open the chat bot and press Start/);
  assert.match(appSource, /Open Telegram bot/);
  assert.ok(
    appSource.indexOf("confirmation-telegram-card") < appSource.indexOf("confirmation-payment-details-card"),
    "Telegram setup should appear before bank-transfer details on the confirmation page"
  );
}

// Test 0h.1: Client date picker cannot keep stale past dates after date rollover.
{
  assert.match(appSource, /const clientTodayValue = todayValue\(\);/);
  assert.match(appSource, /const clientDateWindow = buildDaysForDateRange\(clientTodayValue, addDaysToDateValue\(clientTodayValue, 30\), days\)/);
  assert.match(appSource, /\.filter\(\(day\) => day\.dateValue >= clientTodayValue\)/);
  assert.match(appSource, /if \(dateValue && dateValue < todayValue\(\)\) \{/);
  assert.match(appSource, /Past dates cannot be booked online\. Please choose today or a future date\./);
  assert.match(appSource, /if \(days\[clientDayIndex\]\?\.dateValue >= todayValue\(\)\) return;/);
}

// Test 0i: Client authentication has one password-based entry shell.
{
  const portalSource = readFileSync(new URL("./components/Client/ClientPortal.jsx", import.meta.url), "utf8");
  const supabaseClientSource = readFileSync(new URL("./supabaseClient.js", import.meta.url), "utf8");
  assert.match(supabaseClientSource, /signInClientWithEmailPassword/);
  assert.match(supabaseClientSource, /registerClientWithEmailPassword/);
  assert.match(supabaseClientSource, /requestClientPasswordRecovery/);
  assert.match(supabaseClientSource, /updateClientPassword/);
  assert.match(portalSource, /Continue with Google/);
  assert.match(portalSource, /Sign in with email/);
  assert.match(portalSource, /Create account/);
  assert.match(portalSource, /Forgot password/);
  assert.doesNotMatch(appSource, /ClientOnboarding|ClientEmailSignInForm/);
}

// Test 0j: Client auth and recovery callbacks are explicit and separate from Admin recovery.
{
  const productionRedirect = buildClientAuthRedirectUrl({ env: { MODE: "production", VITE_PUBLIC_APP_URL: "https://vadmassage.com/" }, location: { origin: "http://127.0.0.1:5173", pathname: "/" } });
  assert.equal(normalizePublicAppUrl("https://vadmassage.com/"), "https://vadmassage.com");
  assert.equal(productionRedirect, "https://vadmassage.com/?view=client&clientAuth=callback");
  assert.match(appSource, /isClientPasswordRecoveryRedirect/);
  assert.match(appSource, /setClientPasswordRecovery\(true\)/);
  assert.match(appSource, /setPasswordRecovery\(true\)/);
}
function withBankEnv(values, callback) {
  const previous = Object.fromEntries(BANK_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of BANK_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    return callback();
  } finally {
    for (const key of BANK_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

// Test 1: Bank transfer client booking payload
{
  const booking = {
    id: "test-1",
    serviceId: "deep-tissue",
    serviceName: "Deep Tissue",
    start: "10:00",
    duration: 60,
    travelBuffer: 0,
  };
  const wrapper = { ...booking, dateValue: "2026-06-10", price: 100, bookingReference: "VAD-TEST-1", paymentHoldExpiresAt: "2026-06-10T11:00:00Z" };
  const payload = bookingToSupabasePayload(wrapper, "pending_payment_verification");
  assert.equal(payload.status, "pending_payment_verification");
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.bookingReference, "VAD-TEST-1");
  assert.equal(notes.appBooking.paymentHoldExpiresAt, "2026-06-10T11:00:00Z");
}

// Test 2: Alternative payment request payload
{
  const booking = {
    id: "test-2",
    serviceId: "sports",
    serviceName: "Sports Massage",
    start: "12:00",
    duration: 60,
    travelBuffer: 0,
  };
  const wrapper = { ...booking, dateValue: "2026-06-11", price: 120, bookingReference: "VAD-ALT-1", paymentHoldExpiresAt: "2026-06-11T13:00:00Z" };
  const payload = bookingToSupabasePayload(wrapper, "payment_method_review");
  assert.equal(payload.status, "payment_method_review");
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.bookingReference, "VAD-ALT-1");
  assert.equal(notes.appBooking.paymentHoldExpiresAt, "2026-06-11T13:00:00Z");
}

// Test 3: Admin confirm simulated via generating payload with paid/confirmed
{
  const booking = {
    id: "test-3",
    serviceId: "relax",
    serviceName: "Relax Massage",
    start: "14:00",
    duration: 60,
    travelBuffer: 0,
  };
  const wrapper = { ...booking, dateValue: "2026-06-12", price: 80, bookingReference: "VAD-ADM-1", paymentHoldExpiresAt: "2026-06-12T15:00:00Z" };
  const payload = bookingToSupabasePayload(wrapper, "confirmed");
  assert.equal(payload.status, "confirmed");
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.bookingReference, "VAD-ADM-1");
}

// Test 3b: Selected enhancements are persisted as booking-time item snapshots.
{
  const booking = {
    id: "test-enhancement-1",
    serviceId: "massage",
    serviceName: "Massage",
    start: "10:00",
    duration: 60,
    travelBuffer: 0,
    items: [
      { id: "massage", name: "Massage", minutes: 60, price: 85 },
      { id: "cupping", name: "Cupping therapy", minutes: 0, price: 10 },
      { id: "heated-pad", name: "Heated treatment pad", minutes: 0, price: 0 },
    ],
  };
  const payload = bookingToSupabasePayload({
    ...booking,
    dateValue: "2026-06-12",
    price: 95,
    bookingReference: "VAD-ENH-1",
  }, "pending_payment_verification");
  const notes = JSON.parse(payload.notes);
  assert.equal(payload.price, 95);
  assert.deepEqual(
    notes.appBooking.items.map((item) => ({ id: item.id, name: item.name, price: item.price })),
    [
      { id: "massage", name: "Massage", price: 85 },
      { id: "cupping", name: "Cupping therapy", price: 10 },
      { id: "heated-pad", name: "Heated treatment pad", price: 0 },
    ]
  );
}

// Test 3c: Review enhancement rows keep an immediate accessible remove control.
{
  assert.match(appSource, /review-enhancement-remove-button/);
  assert.match(appSource, /aria-label=\{`Remove \$\{enhancement\.name\} from appointment`\}/);
  assert.match(appSource, /review-enhancement-added/);
}

// Test 3d: Client enhancements do not clear the selected appointment time.
{
  assert.match(appSource, /const \[timeReselectMessage, setTimeReselectMessage\] = useState\(""\);/);
  assert.match(appSource, /setTimeReselectMessage\(""\);/);
  assert.match(appSource, /clientBookingMessage \|\| timeReselectMessage/);
  const toggleEnhancementIndex = appSource.indexOf("function toggleEnhancement");
  const selectTimeSlotIndex = appSource.indexOf("async function selectTimeSlot", toggleEnhancementIndex);
  const toggleEnhancementSource = appSource.slice(toggleEnhancementIndex, selectTimeSlotIndex);
  assert.match(toggleEnhancementSource, /const selectedSlotBeforeToggle = clientSelectedSlot;/);
  assert.match(toggleEnhancementSource, /setClientSelectedSlot\(selectedSlotBeforeToggle\);[\s\S]*setClientStep\("review"\);/);
  assert.doesNotMatch(toggleEnhancementSource, /setClientSelectedSlot\(null\)/);
  assert.doesNotMatch(toggleEnhancementSource, /setClientStep\("time"\)/);
}

// Test 3d.1: Slots rejected by the hold RPC are hidden locally until availability refresh catches up.
{
  assert.match(appSource, /function isSlotUnavailableError\(error\)/);
  assert.match(appSource, /const \[temporaryUnavailableSlots, setTemporaryUnavailableSlots\] = useState\(\[\]\);/);
  assert.match(appSource, /temporaryUnavailableBookingsForSelectedDay/);
  assert.match(appSource, /const clientAvailabilityBlocks = \[/);
  assert.match(appSource, /bookings: clientAvailabilityBlocks/);
  const selectTimeSlotIndex = appSource.indexOf("async function selectTimeSlot");
  const updateContactIndex = appSource.indexOf("function updateContactDetail", selectTimeSlotIndex);
  const selectTimeSlotSource = appSource.slice(selectTimeSlotIndex, updateContactIndex);
  assert.match(selectTimeSlotSource, /if \(isSlotUnavailableError\(error\)\) \{/);
  assert.match(selectTimeSlotSource, /setTemporaryUnavailableSlots\(\(current\) => \{/);
  assert.match(selectTimeSlotSource, /expiresAt: Date\.now\(\) \+ 10 \* 60 \* 1000/);
}

// Test 3e: Session preference card uses compact copy and accessible chip state.
{
  assert.match(appSource, /Session preferences/);
  assert.doesNotMatch(appSource, /Want a mixed session\?/);
  assert.doesNotMatch(appSource, /First hour deep tissue, final 30 minutes relaxing massage/);
  assert.match(appSource, /Add notes or preferences for your session/);
  assert.match(appSource, /aria-pressed=\{selected\}/);
  assert.match(appSource, /More preferences/);
  assert.match(appSource, /Show less/);
  assert.match(appSource, /selectedSessionPreferenceIds/);
  assert.match(appSource, /getVisibleSessionPreferences\(sessionPreferences\)/);
}

// Test 3f: Session notes and quick preference IDs persist in the booking snapshot.
{
  const booking = {
    id: "test-session-preferences-1",
    serviceId: "massage",
    serviceName: "Massage",
    start: "10:00",
    duration: 60,
    travelBuffer: 0,
    sessionNotes: "Please spend more time on my right shoulder.",
    sessionPreferenceIds: [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111121",
      "unknown_preference",
    ],
    sessionPreferenceLabels: [
      { id: "11111111-1111-4111-8111-111111111111", label: "Neck focus" },
      { id: "11111111-1111-4111-8111-111111111121", label: "Head massage" },
    ],
  };
  const payload = bookingToSupabasePayload({
    ...booking,
    dateValue: "2026-06-12",
    price: 85,
    bookingReference: "VAD-PREF-1",
  }, "pending_payment_verification");
  const notes = JSON.parse(payload.notes);

  assert.equal(notes.appBooking.sessionNotes, "Please spend more time on my right shoulder.");
  assert.deepEqual(notes.appBooking.sessionPreferenceIds, [
    "11111111-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-111111111121",
  ]);
  assert.deepEqual(notes.appBooking.sessionPreferenceLabels, [
    { id: "11111111-1111-4111-8111-111111111111", label: "Neck focus" },
    { id: "11111111-1111-4111-8111-111111111121", label: "Head massage" },
  ]);
}

// Test 4: Friendly status labels
{
  assert.equal(friendlyPaymentStatus("pending_payment_verification"), "Awaiting Payment Verification");
  assert.equal(friendlyPaymentStatus("payment_method_review"), "Alternative payment request under review");
  assert.equal(
    friendlyPaymentStatus("cash_on_arrival", "payment_method_review"),
    "Payment on Arrival - Awaiting Admin Approval"
  );
  assert.equal(
    friendlyPaymentStatus("cash_on_arrival", "confirmed"),
    "Approved - Due on Arrival"
  );
}

// Test 5: Telegram/email formatting includes booking reference/payment status/expiry
{
  const booking = {
    id: "test-4",
    clientName: "Jane Doe",
    serviceName: "Deep Tissue",
    duration: 90,
    dateValue: "2026-06-13",
    start: "18:00",
    price: 115,
    bookingReference: "VAD-260613-1800",
    paymentHoldExpiresAt: "2026-06-13T19:00:00Z",
    paymentMethod: "bank_transfer",
    paymentStatus: "awaiting_verification",
  };
  const text = buildAdminTelegramMessage("booking_created", { booking });
  assert.ok(text.includes("Reference:"), "Telegram should include Reference");
  assert.ok(text.includes("Payment Status"), "Telegram should include Payment Status label");
  assert.ok(text.includes("Reservation Expires"), "Telegram should include Reservation Expires");

  const email = withBankEnv({
    BANK_ACCOUNT_NAME: "Configured Massage",
    BANK_NAME: "Configured Bank",
    BANK_SORT_CODE: "11-22-33",
    BANK_ACCOUNT_NUMBER: "87654321",
  }, () => emailTemplates.bookingConfirmation({
    customer: { name: "Jane Doe" },
    appointments: [],
    date: "13 June 2026",
    time: "18:00",
    total: 115,
    bookingReference: booking.bookingReference,
    status: "pending_payment_verification",
    paymentMethod: booking.paymentMethod,
    paymentHoldExpiresAt: booking.paymentHoldExpiresAt,
  }));

  assert.ok(email.subject.toLowerCase().includes("received"), "Email subject should mention the request was received");
  assert.ok(email.html.includes(booking.bookingReference), "Email HTML should include booking reference");
  assert.ok(email.html.includes("Payment details"), "Email should include payment details section");
  assert.ok(email.html.includes("Configured Massage"), "Email should include configured account name");
  assert.ok(email.html.includes("Configured Bank"), "Email should include configured bank name");
  assert.ok(email.html.includes("11-22-33"), "Email should include configured sort code");
  assert.ok(email.html.includes("87654321"), "Email should include configured account number");
  assert.equal(paymentMethodToPaymentStatus("bank_transfer"), "awaiting_verification");
}

// Test 6: Missing or partial bank configuration should render safely without fake details.
{
  const missingConfigEmail = withBankEnv({}, () => emailTemplates.bookingConfirmation({
    customer: { name: "Missing Config" },
    appointments: [],
    date: "15 June 2026",
    time: "10:00",
    total: 110,
    bookingReference: "VAD-MISSING-BANK",
    status: "pending_payment_verification",
    paymentMethod: "bank_transfer",
  }));

  assert.ok(missingConfigEmail.html.includes("Bank details are temporarily unavailable"));
  assert.ok(!missingConfigEmail.html.includes("12-34-56"));
  assert.ok(!missingConfigEmail.html.includes("12345678"));
  assert.ok(missingConfigEmail.text.includes("I'll confirm your appointment as soon as I've checked your payment."));

  const partialConfigEmail = withBankEnv({
    BANK_ACCOUNT_NAME: "Partial Massage",
    BANK_SORT_CODE: "11-22-33",
  }, () => emailTemplates.bookingConfirmation({
    customer: { name: "Partial Config" },
    appointments: [],
    date: "15 June 2026",
    time: "11:00",
    total: 120,
    bookingReference: "VAD-PARTIAL-BANK",
    status: "pending_payment_verification",
    paymentMethod: "bank_transfer",
  }));

  assert.ok(partialConfigEmail.html.includes("Bank details are temporarily unavailable"));
  assert.ok(!partialConfigEmail.html.includes("Partial Massage"));
  assert.ok(!partialConfigEmail.html.includes("11-22-33"));
  assert.ok(!partialConfigEmail.html.includes("12-34-56"));
  assert.ok(!partialConfigEmail.html.includes("12345678"));
}

// Test 7: Cash-on-arrival request should clearly signal pending personal review.
{
  const email = emailTemplates.bookingConfirmation({
    customer: { name: "Jamie Cash" },
    appointments: [],
    date: "14 June 2026",
    time: "16:00",
    total: 95,
    bookingReference: "VAD-CASH-1",
    status: "payment_method_review",
    paymentMethod: "cash",
    paymentStatus: "cash_on_arrival",
    paymentHoldExpiresAt: "2026-06-14T17:00:00Z",
  });

  assert.ok(
    email.subject.toLowerCase().includes("payment on arrival"),
    "Cash-on-arrival review email should signal the request was received"
  );
  assert.ok(
    email.html.includes("I've received your cash payment request and I'll confirm shortly"),
    "Cash-on-arrival review email should explain the personal review state"
  );
  assert.ok(email.html.includes("VAD-CASH-1"), "Email should include booking reference for cash reviews");
  assert.ok(email.html.includes("Payment details"), "Email should include payment details section for cash reviews");
  assert.ok(!email.html.includes("<strong>Bank:</strong>"), "Cash-on-arrival email should not include bank details");
}

// Test 8: Approved cash-on-arrival remains due on arrival, rather than becoming paid.
{
  const email = emailTemplates.bookingConfirmation({
    customer: { name: "Jamie Cash" },
    appointments: [],
    date: "14 June 2026",
    time: "16:00",
    total: 95,
    bookingReference: "VAD-CASH-2",
    status: "confirmed",
    paymentMethod: "cash",
    paymentStatus: "cash_on_arrival",
  });
  const telegram = buildAdminTelegramMessage("payment_status", {
    amount: 95,
    booking: {
      bookingReference: "VAD-CASH-2",
      clientName: "Jamie Cash",
      paymentMethod: "cash",
      paymentStatus: "cash_on_arrival",
      status: "confirmed",
    },
    bookingStatus: "confirmed",
    paymentMethod: "cash",
    status: "cash_on_arrival",
  });

  assert.ok(email.html.includes("Your booking is confirmed. Payment is due on arrival."));
  assert.ok(email.text.includes("Payment is due on arrival."));
  assert.ok(telegram.includes("Approved - Due on Arrival"));
}

// Test 9: Scenario A - bank transfer awaits verification, then admin marks paid and receipt is generated.
{
  const booking = {
    id: "bank-flow-1",
    bookingReference: "VDM-BANK-1",
    clientName: "Bank Client",
    customerEmail: "bank@example.com",
    dateValue: "2026-06-19",
    duration: 90,
    paymentHoldExpiresAt: "2026-06-19T12:00:00Z",
    paymentMethod: "bank_transfer",
    paymentStatus: paymentMethodToPaymentStatus("bank_transfer"),
    price: 125,
    serviceId: "deep-tissue",
    serviceName: "Deep Tissue Massage",
    start: "10:30",
    status: paymentMethodToBookingStatus("bank_transfer"),
    travelBuffer: 15,
  };
  const payload = bookingToSupabasePayload(booking, booking.status);
  const notes = JSON.parse(payload.notes);
  assert.equal(notes.appBooking.paymentMethod, "bank_transfer");
  assert.equal(notes.appBooking.paymentStatus, "awaiting_verification");
  assert.equal(notes.appBooking.paymentReference, "VDM-BANK-1");
  assert.equal(notes.appBooking.paymentExpiry, "2026-06-19T12:00:00Z");

  const paidPatch = normalizeAdminBookingApprovalPatch({ paymentStatus: "paid" }, booking);
  const paidBooking = { ...booking, ...paidPatch };
  assert.equal(paidBooking.status, "confirmed");
  assert.equal(paidBooking.paymentStatus, "paid");
  assert.ok(paidBooking.paymentReceivedAt);

  const receipt = emailTemplates.receipt({
    ...bookingEmailPayloadForTest(paidBooking),
    paymentReceivedAt: paidBooking.paymentReceivedAt,
  });
  const telegram = buildAdminTelegramMessage("payment_status", {
    amount: 125,
    booking: paidBooking,
    bookingStatus: paidBooking.status,
    paymentMethod: paidBooking.paymentMethod,
    status: paidBooking.paymentStatus,
  });
  assert.ok(receipt.html.includes("VDM-BANK-1"));
  assert.ok(receipt.html.includes("Payment received"));
  assert.ok(telegram.includes("Paid"));
  assert.ok(telegram.includes("Payment Received"));
}

// Test 10: Scenario B - cash request can be approved, stays due on arrival, then marked paid later.
{
  const cashBooking = {
    id: "cash-flow-1",
    bookingReference: "VDM-CASH-APPROVE",
    clientName: "Cash Client",
    dateValue: "2026-06-20",
    duration: 60,
    paymentMethod: "cash",
    paymentStatus: "cash_on_arrival",
    price: 95,
    serviceId: "relaxation",
    serviceName: "Relaxation Massage",
    start: "12:00",
    status: "payment_method_review",
    travelBuffer: 15,
  };
  const cashPayload = bookingToSupabasePayload(cashBooking, cashBooking.status);
  assert.equal(JSON.parse(cashPayload.notes).appBooking.cashOnArrivalRequest, true);

  const approvedPatch = normalizeAdminBookingApprovalPatch(
    { paymentStatus: "cash_on_arrival", status: "confirmed" },
    cashBooking
  );
  const approvedBooking = { ...cashBooking, ...approvedPatch };
  assert.equal(approvedBooking.status, "confirmed");
  assert.equal(approvedBooking.paymentStatus, "cash_on_arrival");
  assert.equal(approvedBooking.cashOnArrivalRequest, undefined);

  const paidPatch = normalizeAdminBookingApprovalPatch({ paymentStatus: "paid" }, approvedBooking);
  assert.equal(paidPatch.paymentStatus, "paid");
  assert.match(paidPatch.paymentReceivedAt, /^\d{4}-\d{2}-\d{2}T/);
}

// Test 10: Scenario C - rejected payment request becomes cancelled and sends cancellation messaging.
{
  const rejectedPatch = normalizeAdminBookingApprovalPatch(
    { paymentStatus: "cancelled", status: "cancelled" },
    { paymentMethod: "cash", paymentStatus: "cash_on_arrival", status: "payment_method_review" }
  );
  assert.deepEqual(rejectedPatch, { paymentStatus: "cancelled", status: "cancelled" });

  const cancellation = emailTemplates.cancellationConfirmation({
    date: "2026-06-21",
    time: "15:00",
  });
  const telegram = buildAdminTelegramMessage("payment_status", {
    booking: {
      bookingReference: "VDM-REJECTED",
      clientName: "Rejected Client",
      paymentMethod: "cash",
      paymentStatus: "cancelled",
      status: "cancelled",
    },
    bookingStatus: "cancelled",
    paymentMethod: "cash",
    status: "cancelled",
  });
  assert.ok(cancellation.subject.toLowerCase().includes("cancelled"));
  assert.ok(telegram.includes("Cancelled"));
  assert.ok(telegram.includes("VDM-REJECTED"));
}

console.log("Reservation flow tests passed.");

function bookingEmailPayloadForTest(booking) {
  return {
    bookingReference: booking.bookingReference,
    customer: { name: booking.clientName },
    date: booking.dateValue,
    durationMinutes: booking.duration,
    items: [{ name: booking.serviceName, minutes: booking.duration, price: booking.price }],
    paymentMethod: booking.paymentMethod,
    paymentReference: booking.paymentReference || booking.bookingReference,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    time: booking.start,
    total: booking.price,
  };
}
