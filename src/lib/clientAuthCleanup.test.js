import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildClientAuthRedirectUrl, buildClientRecoveryRedirectUrl } from "./authRedirect.js";
import { clearObsoleteClientSessionStorage, OBSOLETE_CLIENT_SESSION_KEYS } from "./obsoleteClientStorage.js";

test("client auth callbacks use explicit normal and recovery markers", () => {
  const options={env:{MODE:"production",VITE_PUBLIC_APP_URL:"https://booking.vadmassage.com"},location:{origin:"http://localhost",pathname:"/"}};
  assert.equal(buildClientAuthRedirectUrl(options),"https://booking.vadmassage.com/?view=client&clientAuth=callback");
  assert.equal(buildClientRecoveryRedirectUrl(options),"https://booking.vadmassage.com/?view=client&clientAuth=recovery");
});
test("only obsolete client-flow session keys are cleared", () => {
  const values=new Map([...OBSOLETE_CLIENT_SESSION_KEYS.map(key=>[key,"old"]),["supabase-session","keep"],["chainScheduler.bookingHoldClientKey","keep"]]);
  clearObsoleteClientSessionStorage({removeItem:key=>values.delete(key)});
  assert.deepEqual([...values.keys()],["supabase-session","chainScheduler.bookingHoldClientKey"]);
});
test("auth helpers use Google and email/password APIs", () => {
  const source=readFileSync(new URL("../supabaseClient.js",import.meta.url),"utf8");
  for(const api of ["signInWithOAuth","signInWithPassword","signUp","resend","resetPasswordForEmail","updateUser"]) assert.match(source,new RegExp(api));
  assert.doesNotMatch(source,/signInWithOtp/);
});
test("legacy invitation entry and duplicate signed-out controls are absent", () => {
  const app=readFileSync(new URL("../App.jsx",import.meta.url),"utf8");
  const main=readFileSync(new URL("../main.jsx",import.meta.url),"utf8");
  const location=readFileSync(new URL("../components/Booking/ClientBookingFlowScreens.jsx",import.meta.url),"utf8");
  const bookings=readFileSync(new URL("../components/Client/MyBookingsPanel.jsx",import.meta.url),"utf8");
  assert.doesNotMatch(main,/\/onboarding|ClientOnboarding/);
  assert.doesNotMatch(app,/ClientOnboarding|ClientEmailSignInForm|accept_client_invitation|validate_client_invitation/);
  assert.doesNotMatch(location,/ClientAccountPanel|Continue with Google/);
  assert.doesNotMatch(bookings,/ClientEmailSignInForm|Continue with Google/);
});
test("Telegram client linking remains present", () => {
  const admin=readFileSync(new URL("../components/Admin/AdminClientTelegramPanel.jsx",import.meta.url),"utf8");
  assert.match(admin,/admin_create_client_telegram_invitation/);
});

test("client and Admin password recovery remain separate", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../components/Admin/AdminLogin.jsx", import.meta.url), "utf8");
  assert.match(app, /requestClientPasswordRecovery/);
  assert.match(app, /requestAdminPasswordRecovery/);
  assert.match(admin, /onRequestPasswordRecovery/);
});
