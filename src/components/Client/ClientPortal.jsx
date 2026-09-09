import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import {
  CLIENT_AUTH_MESSAGES,
  CLIENT_PASSWORD_MIN_LENGTH,
  clientNeedsEmailVerification,
  runSingleClientAuthSubmission,
  validateClientCredentials,
  validateClientEmail,
} from "../../lib/clientAuthValidation.js";
import "../../styles/clientAccess.css";
import { ClientRegistrationForm, ConfirmationPanel } from "./ClientRegistrationForm.jsx";

const BLOCKED_MESSAGE = "Online booking is currently unavailable for this account. Please contact me.";

function SignInForm({ busy, error, notice, onCreateAccount, onForgot, onGoogle, onSignIn, onSwitchAdmin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const validation = validateClientCredentials(email, password);
  const isBusy = busy || submitting;
  const submit = async (event) => {
    event.preventDefault();
    const result = validateClientCredentials(email, password);
    if (!result.valid) { setValidationError(result.error); return; }
    setValidationError("");
    try {
      await runSingleClientAuthSubmission(
        submissionLock,
        () => onSignIn(result.email, result.password),
        setSubmitting,
      );
    } catch {
      setValidationError(CLIENT_AUTH_MESSAGES.signInFailed);
    }
  };
  return <section className="client-access-page client-auth-entry" aria-label="Client account sign in">
    <p className="eyebrow">VadMassage</p><h1>Welcome</h1>
    <p>Sign in to book or manage your appointments.</p>
    <button type="button" className="google-login-button" disabled={isBusy} onClick={onGoogle}><span aria-hidden="true">G</span> Continue with Google</button>
    <form noValidate onSubmit={submit}>
      <label>Email address<input type="email" autoComplete="email" aria-required="true" value={email} onBlur={() => setValidationError(validateClientEmail(email).error)} onChange={e => { setEmail(e.target.value); setValidationError(""); }} /></label>
      <label>Password<input type="password" minLength={CLIENT_PASSWORD_MIN_LENGTH} autoComplete="current-password" aria-required="true" value={password} onBlur={() => { if (validateClientEmail(email).valid) setValidationError(validateClientCredentials(email, password).error); }} onChange={e => { setPassword(e.target.value); setValidationError(""); }} /></label>
      <button disabled={isBusy || !validation.valid}>{isBusy ? "Please wait..." : "Sign in"}</button>
    </form>
    <div className="client-account-button-row">
      <button type="button" className="secondary-button" disabled={isBusy || !validateClientEmail(email).valid} onClick={() => onForgot(email.trim().toLowerCase())}>Forgot password</button>
    </div>
    <p className="client-account-switch">New here? <button type="button" className="link-button" disabled={isBusy} onClick={onCreateAccount}>Create account</button></p>
    {notice && <p role="status" className="client-account-notice">{notice}</p>}
    {(validationError || error) && <p role="alert" className="client-account-error">{validationError || error}</p>}
    {import.meta.env.DEV && <button type="button" className="secondary-button" onClick={onSwitchAdmin}>Admin</button>}
  </section>;
}

function ProfileForm({ busy, error, onActivate, session }) {
  const metadata = session.user.user_metadata || {};
  const names = String(metadata.full_name || metadata.name || "").trim().split(/\s+/);
  const initialProfile = { first_name: String(metadata.first_name || names[0] || "").trim(), last_name: String(metadata.last_name || names.slice(1).join(" ") || "").trim(), mobile: String(metadata.mobile || "").trim() };
  const [missingFields] = useState(() => Object.keys(initialProfile).filter(key => !initialProfile[key]));
  const [profile, setProfile] = useState(initialProfile);
  const [editAll, setEditAll] = useState(false);
  const submit = (event) => { event.preventDefault(); void onActivate(profile); };
  return <section className="client-access-page" aria-label="Complete client profile">
    <p className="eyebrow">Your account</p><h1>Complete your profile</h1><p>These details are needed to arrange your appointment.</p>
    {missingFields.length === 0 && !editAll && !error && <p>{profile.first_name} {profile.last_name} · {profile.mobile} <button type="button" onClick={() => setEditAll(true)}>Edit details</button></p>}
    <form onSubmit={submit}>
      {(editAll || error || missingFields.includes("first_name")) && <label>First name<input required maxLength={100} value={profile.first_name} onChange={e => setProfile({...profile, first_name:e.target.value})} /></label>}
      {(editAll || error || missingFields.includes("last_name")) && <label>Last name<input required maxLength={100} value={profile.last_name} onChange={e => setProfile({...profile, last_name:e.target.value})} /></label>}
      {(editAll || error || missingFields.includes("mobile")) && <label>Mobile number<input required type="tel" maxLength={40} value={profile.mobile} onChange={e => setProfile({...profile, mobile:e.target.value})} /></label>}
      <button disabled={busy}>{busy ? "Saving..." : "Continue"}</button>
    </form>{error && <p role="alert" className="client-account-error">{error}</p>}
  </section>;
}

function RecoveryForm({ busy, error, onUpdate }) {
  const [password, setPassword] = useState("");
  return <section className="client-access-page" aria-label="Reset client password"><h1>Choose a new password</h1>
    <form onSubmit={e => { e.preventDefault(); void onUpdate(password); }}><label>New password<input type="password" autoComplete="new-password" minLength={CLIENT_PASSWORD_MIN_LENGTH} required value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy || password.length < CLIENT_PASSWORD_MIN_LENGTH}>Update password</button></form>
    {error && <p role="alert" className="client-account-error">{error}</p>}
  </section>;
}

export function ClientPortal({ authLoading, authBusy = false, error, isAdmin, notice = "", onForgot, onGoogle, onPasswordUpdate, onResendVerification, onSignIn, onSignOut, onSignUp, onSwitchAdmin, recovery, renderDestination, session }) {
  const initialDestination = new URLSearchParams(window.location.search).get("clientStep") === "my-bookings" ? "my-bookings" : "home";
  const [destination, setDestination] = useState(initialDestination);
  const readAuthScreen = () => new URLSearchParams(window.location.search).get("register") === "1" ? "register" : "signin";
  const [authScreen, setAuthScreen] = useState(readAuthScreen);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  useEffect(() => { if (session?.access_token && session.user?.email_confirmed_at) setConfirmationEmail(""); }, [session?.access_token, session?.user?.email_confirmed_at]);
  function navigateAuth(screen) {
    const url = new URL(window.location.href);
    if (screen === "register") url.searchParams.set("register", "1"); else url.searchParams.delete("register");
    window.history.pushState({ ...window.history.state }, "", url);
    setConfirmationEmail(""); setAuthScreen(screen);
  }
  useEffect(() => {
    const onBack = () => { setConfirmationEmail(""); setAuthScreen(readAuthScreen()); };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  const [access, setAccess] = useState({ kind: "SESSION_LOADING" });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const accessRequest = useRef(0);
  const activationLock = useRef(false);
  async function refreshAccess() {
    const request = ++accessRequest.current;
    if (!session?.user) { setAccess({ kind: "SIGNED_OUT" }); return; }
    if (clientNeedsEmailVerification(session.user)) { setAccess({ kind: "CONFIRMATION_REQUIRED" }); return; }
    if (isAdmin) { setAccess({ kind: "ERROR" }); return; }
    setAccess({ kind: "SESSION_LOADING" });
    let data, accessError;
    try { ({ data, error: accessError } = await supabase.rpc("get_my_client_access")); } catch (error) { accessError = error; }
    if (request !== accessRequest.current) return;
    if (accessError) { setLocalError("I couldn't check your account just now. Please try again."); setAccess({ kind: "ERROR" }); return; }
    if (data?.status === "BLOCKED") setAccess({ kind: "BLOCKED", data });
    else if (data?.status === "ACTIVE" && data?.profile_complete) setAccess({ kind: "ACTIVE", data });
    else setAccess({ kind: "PROFILE_REQUIRED", data });
  }
  useEffect(() => { if (!authLoading) void refreshAccess(); }, [authLoading, session?.user?.id, session?.user?.email_confirmed_at, isAdmin]);
  async function activate(profile) {
    if (!session?.access_token || clientNeedsEmailVerification(session.user) || activationLock.current) return;
    activationLock.current = true;
    setBusy(true); setLocalError("");
    let activationError;
    try { ({ error: activationError } = await supabase.rpc("activate_my_client_account", { profile_fields: profile })); } catch (error) { activationError = error; }
    activationLock.current = false;
    setBusy(false);
    if (activationError) { setLocalError(activationError.message?.includes("blocked") ? BLOCKED_MESSAGE : "Please check your profile details and try again."); await refreshAccess(); return; }
    await refreshAccess();
  }
  if (authLoading || access.kind === "SESSION_LOADING") return <p className="client-account-loading" role="status">Checking your account...</p>;
  if (recovery && session?.user) return <RecoveryForm busy={busy} error={localError || error} onUpdate={onPasswordUpdate} />;
  if (confirmationEmail || access.kind === "CONFIRMATION_REQUIRED") return <ConfirmationPanel email={confirmationEmail || session.user.email} onResend={onResendVerification} onDifferentEmail={async () => { if (session?.user) await onSignOut(); navigateAuth("register"); }} onSignIn={async () => { if (session?.user) await onSignOut(); navigateAuth("signin"); }} />;
  if (!session?.user || access.kind === "SIGNED_OUT") return authScreen === "register"
    ? <ClientRegistrationForm externalError={error} busy={busy || authBusy} onSignUp={onSignUp} onConfirmation={setConfirmationEmail} onGoogle={onGoogle} onSignIn={() => navigateAuth("signin")} />
    : <SignInForm busy={busy || authBusy} error={error} notice={notice} onCreateAccount={() => navigateAuth("register")} onForgot={onForgot} onGoogle={onGoogle} onSignIn={onSignIn} onSwitchAdmin={onSwitchAdmin} />;
  if (access.kind === "PROFILE_REQUIRED") return <ProfileForm busy={busy} error={localError || error} onActivate={activate} session={session} />;
  if (access.kind === "ERROR") return <section className="client-access-page" role="alert"><h1>Account unavailable</h1><p>{isAdmin ? "This is an Admin account. Continue to the protected Admin area." : localError || "I couldn't check your account just now. Please try again."}</p>{!isAdmin && <button type="button" onClick={() => { setLocalError(""); void refreshAccess(); }}>Try again</button>}{isAdmin && <button type="button" onClick={onSwitchAdmin}>Continue to Admin</button>}<button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button></section>;
  if (destination !== "home") return renderDestination(destination, () => setDestination("home"), access.kind);
  return <section className="client-access-page client-home" aria-label="Client home"><p className="eyebrow">VadMassage</p><h1>Welcome back</h1>
    {access.kind === "BLOCKED" && <p role="status">{BLOCKED_MESSAGE}</p>}
    <div className="client-home-actions">
      {access.kind === "ACTIVE" && <button type="button" onClick={() => setDestination("booking")}>Book appointment</button>}
      <button type="button" onClick={() => setDestination("my-bookings")}>My Bookings</button>
      <button type="button" onClick={() => setDestination("account")}>Account</button>
    </div>
    <button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button>
  </section>;
}
