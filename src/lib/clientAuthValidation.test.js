import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CLIENT_AUTH_MESSAGES,
  CLIENT_PASSWORD_MIN_LENGTH,
  mapClientRegistrationError,
  mapClientSignInError,
  runSingleClientAuthSubmission,
  validateClientCredentials,
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
  assert.equal(mapClientRegistrationError(new TypeError("Failed to fetch")), CLIENT_AUTH_MESSAGES.registrationFailed);
  assert.equal(mapClientRegistrationError({ code: "weak_password" }), "Password must be at least 6 characters.");
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
});
