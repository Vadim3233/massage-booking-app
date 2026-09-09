import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CLIENT_AUTH_MESSAGES,
  CLIENT_PASSWORD_MIN_LENGTH,
  REGISTRATION_PASSWORD_MIN_LENGTH,
  classifySignupResult,
  clientNeedsEmailVerification,
  isEmailConfirmationRequiredError,
  mapClientRegistrationError,
  mapClientSignInError,
  runSingleClientAuthSubmission,
  validateClientCredentials,
  validateClientRegistration,
} from "./clientAuthValidation.js";

test("registration rejects empty email before submission", () => {
  assert.deepEqual(validateClientCredentials("  ", "123456"), { valid: false, email: "", error: "Enter your email address." });
});

test("registration rejects malformed email", () => {
  assert.equal(validateClientCredentials(" client-at-example.com ", "123456").error, "Enter a valid email address.");
});

test("registration rejects an empty password", () => {
  assert.equal(validateClientCredentials("client@example.com", "").error, "Enter a password.");
});

test("registration uses the production six-character password minimum", () => {
  assert.equal(CLIENT_PASSWORD_MIN_LENGTH, 6);
  assert.equal(validateClientCredentials("client@example.com", "12345").error, "Password must be at least 6 characters.");
});

test("registration requires first name, last name and valid mobile", () => {
  const valid = { firstName: "Jo", lastName: "Client", mobile: "+44 7700 900123", email: "jo@example.com", password: "12345678", confirmPassword: "12345678" };
  assert.equal(validateClientRegistration({ ...valid, firstName: "" }).error, "Enter your first name.");
  assert.equal(validateClientRegistration({ ...valid, lastName: "" }).error, "Enter your last name.");
  assert.equal(validateClientRegistration({ ...valid, mobile: "" }).error, "Enter your mobile number.");
  assert.equal(validateClientRegistration({ ...valid, mobile: "123" }).error, "Enter a valid mobile number.");
  assert.equal(validateClientRegistration(valid).valid, true);
});

test("registration requires matching password confirmation", () => {
  const result = validateClientRegistration({ firstName: "Jo", lastName: "Client", mobile: "+447700900123", email: "jo@example.com", password: "12345678", confirmPassword: "654321" });
  assert.equal(result.error, "Passwords do not match.");
});

test("valid trimmed credentials invoke the request exactly once", async () => {
  const lock = { current: false };
  const validation = validateClientCredentials(" Client@Example.com ", "123456");
  let calls = 0;
  await runSingleClientAuthSubmission(lock, async () => { calls += 1; return validation; });
  assert.equal(calls, 1);
  assert.equal(validation.email, "client@example.com");
});

test("failed Supabase request clears loading", async () => {
  const states = [];
  await assert.rejects(runSingleClientAuthSubmission({ current: false }, () => Promise.reject(new Error("Supabase failure")), value => states.push(value)));
  assert.deepEqual(states, [true, false]);
});

test("network and unexpected exceptions clear loading", async () => {
  const states = [];
  await assert.rejects(runSingleClientAuthSubmission({ current: false }, () => { throw new TypeError("Failed to fetch"); }, value => states.push(value)), /Failed to fetch/);
  assert.deepEqual(states, [true, false]);
});

test("duplicate submissions do not duplicate requests", async () => {
  const lock = { current: false };
  let release;
  let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const first = runSingleClientAuthSubmission(lock, () => { calls += 1; return pending; });
  const second = await runSingleClientAuthSubmission(lock, () => { calls += 1; });
  assert.deepEqual(second, { started: false });
  assert.equal(calls, 1);
  release();
  await first;
});

test("existing-account and safe registration errors are usable", () => {
  assert.equal(mapClientRegistrationError({ code: "user_already_exists" }), "An account with this email already exists. Sign in instead.");
  assert.match(mapClientRegistrationError(new TypeError("Failed to fetch")), /Connection problem/);
  assert.match(mapClientRegistrationError({ code: "weak_password" }), /password was rejected/);
});

test("sign-in uses equivalent validation and safe errors", () => {
  assert.equal(validateClientCredentials("", "123456").error, "Enter your email address.");
  assert.equal(validateClientCredentials("bad", "123456").error, "Enter a valid email address.");
  assert.equal(validateClientCredentials("client@example.com", "").error, "Enter a password.");
  assert.equal(mapClientSignInError({ code: "invalid_credentials" }), "Email or password is incorrect.");
  assert.equal(mapClientSignInError(new Error("socket closed")), CLIENT_AUTH_MESSAGES.signInFailed);
});

test("Google authentication remains unchanged", () => {
  const portal = readFileSync(new URL("../components/Client/ClientPortal.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  assert.match(portal, /onClick=\{onGoogle\}[\s\S]*Continue with Google/);
  assert.match(app, /signInClientWithGoogle\(redirectTo\)/);
  assert.match(portal, /missingFields\.includes\("first_name"\)/);
  assert.match(portal, /missingFields\.includes\("last_name"\)/);
  assert.match(portal, /missingFields\.includes\("mobile"\)/);
});

test("create-account navigation is separate from sign-in submission", () => {
  const portal = readFileSync(new URL("../components/Client/ClientPortal.jsx", import.meta.url), "utf8");
  assert.match(portal, /New here\?[^]*type="button"[^]*onClick=\{onCreateAccount\}[^]*Create account/);
  const registration = readFileSync(new URL("../components/Client/ClientRegistrationForm.jsx", import.meta.url), "utf8");
  assert.match(registration, /Already have an account/);
  assert.doesNotMatch(registration, /Your account email:/);
});

test("verification notice is shown only for unverified email users", () => {
  assert.equal(clientNeedsEmailVerification({ email: "jo@example.com", email_confirmed_at: null }), true);
  assert.equal(clientNeedsEmailVerification({ email: "jo@example.com", email_confirmed_at: "2026-09-09T00:00:00Z" }), false);
  assert.equal(clientNeedsEmailVerification({ email: "", email_confirmed_at: null }), false);
  const portal = readFileSync(new URL("../components/Client/ClientPortal.jsx", import.meta.url), "utf8");
  const registration = readFileSync(new URL("../components/Client/ClientRegistrationForm.jsx", import.meta.url), "utf8");
  assert.match(registration, /Resend confirmation email/);
  assert.match(registration, /retryAt/);
});

test("confirmation-required responses are recognized during staged rollout", () => {
  assert.equal(isEmailConfirmationRequiredError({ code: "email_not_confirmed" }), true);
  assert.equal(isEmailConfirmationRequiredError(new Error("Email not confirmed")), true);
  assert.equal(isEmailConfirmationRequiredError(new Error("Invalid credentials")), false);
});

const validRegistration = { firstName: "Jo", lastName: "Client", mobile: "+44 7700 900123", email: "jo@example.com", password: "password8", confirmPassword: "password8" };
test("registration requires eight characters without rejecting existing six-character sign-ins", () => {
 assert.equal(REGISTRATION_PASSWORD_MIN_LENGTH, 8);
 assert.equal(validateClientCredentials("jo@example.com", "123456").valid, true);
 assert.equal(validateClientRegistration({...validRegistration, password: "1234567"}).errors.password, "Password must be at least 8 characters.");
});
test("registration reports all blocking fields and rejects repeated-digit mobile numbers", () => {
 assert.deepEqual(Object.keys(validateClientRegistration({}).errors), ["firstName", "lastName", "mobile", "email", "password", "confirmPassword"]);
 for (const mobile of ["000000000000000", "1111111111", "123", "abc", "+1234567890123456"]) assert.ok(validateClientRegistration({...validRegistration, mobile}).errors.mobile);
 for (const mobile of ["+1 (212) 555-0123", "+33 6 12 34 56 78", "+44 7700 900123"]) assert.equal(validateClientRegistration({...validRegistration, mobile}).valid, true);
});
test("mismatch clears immediately when passwords match", () => {
 assert.equal(validateClientRegistration({...validRegistration, confirmPassword:"different"}).errors.confirmPassword,"Passwords do not match.");
 assert.equal(validateClientRegistration(validRegistration).errors.confirmPassword, undefined);
});
test("signup result distinguishes authenticated, confirmation, duplicate and malformed responses", () => {
 assert.deepEqual(classifySignupResult({session:{access_token:"test",user:{id:"test"}}}), {kind:"authenticated"});
 assert.deepEqual(classifySignupResult({user:{id:"test",identities:[{}]},session:null}), {kind:"confirmation"});
 assert.deepEqual(classifySignupResult({user:{id:"test",identities:[]},session:null}), {kind:"existing"});
 for (const result of [null, {}, {user:{id:"test"}}, {session:{user:{id:"test"}}}]) assert.throws(()=>classifySignupResult(result));
});
test("signup handler neither signs in nor activates before session establishment", () => {
 const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
 const handler = app.slice(app.indexOf("async function handleClientEmailRegistration"),app.indexOf("async function handleClientVerificationResend"));
 assert.match(handler,/registerClientWithEmailPassword/);
 assert.match(handler,/classifySignupResult/);
 assert.doesNotMatch(handler,/signInClientWithEmailPassword|activate_my_client_account/);
});
test("signup and resend have rate-limit and network feedback", () => {
 assert.match(mapClientRegistrationError({status:429}), /Too many requests/);
 assert.match(mapClientRegistrationError({code:"over_email_send_rate_limit"}), /Too many requests/);
 assert.match(mapClientRegistrationError(new TypeError("Failed to fetch")), /Connection problem/);
 assert.match(mapClientSignInError({code:"email_not_confirmed"}), /Confirm your email/);
});

test("validated registration payload survives form-to-handler validation", () => {
 const formPayload=validateClientRegistration(validRegistration);
 assert.equal(validateClientRegistration(formPayload).valid,true);
});
