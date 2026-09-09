import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import {
  CLIENT_AUTH_MESSAGES,
  CLIENT_PASSWORD_MIN_LENGTH,
  runSingleClientAuthSubmission,
  validateClientCredentials,
  validateClientEmail,
} from "../../lib/clientAuthValidation.js";
import "../../styles/clientAccess.css";

const BLOCKED_MESSAGE = "Online booking is currently unavailable for this account. Please contact me.";

function AuthForm({ busy, error, notice, onForgot, onGoogle, onSignIn, onSignUp, onSwitchAdmin }) {
  const [mode, setMode] = useState("signin");
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
        () => mode === "signup" ? onSignUp(result.email, result.password) : onSignIn(result.email, result.password),
        setSubmitting,
      );
    } catch {
      setValidationError(mode === "signup" ? CLIENT_AUTH_MESSAGES.registrationFailed : CLIENT_AUTH_MESSAGES.signInFailed);
    }
  };
  return <section className="client-access-page client-auth-entry" aria-label="Client account sign in">
    <p className="eyebrow">VadMassage</p><h1>{mode === "signup" ? "Create your account" : "Welcome"}</h1>
    <p>{mode === "signup" ? "Create your private account before booking." : "Sign in to book or manage your appointments."}</p>
    <button type="button" className="google-login-button" disabled={isBusy} onClick={onGoogle}><span aria-hidden="true">G</span> Continue with Google</button>
    <form noValidate onSubmit={submit}>
      <label>Email address<input type="email" autoComplete="email" aria-required="true" value={email} onBlur={() => setValidationError(validateClientEmail(email).error)} onChange={e => { setEmail(e.target.value); setValidationError(""); }} /></label>
      <label>Password<input type="password" minLength={CLIENT_PASSWORD_MIN_LENGTH} autoComplete={mode === "signup" ? "new-password" : "current-password"} aria-required="true" value={password} onBlur={() => { if (validateClientEmail(email).valid) setValidationError(validateClientCredentials(email, password).error); }} onChange={e => { setPassword(e.target.value); setValidationError(""); }} /></label>
      {mode === "signup" && <p className="client-account-notice">Use at least {CLIENT_PASSWORD_MIN_LENGTH} characters.</p>}
      <button disabled={isBusy || !validation.valid}>{isBusy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in with email"}</button>
    </form>
    <div className="client-account-button-row">
      <button type="button" className="secondary-button" disabled={isBusy} onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setValidationError(""); }}>{mode === "signup" ? "Sign in instead" : "Create account"}</button>
      <button type="button" className="secondary-button" disabled={isBusy || !validateClientEmail(email).valid} onClick={() => onForgot(email.trim().toLowerCase())}>Forgot password</button>
    </div>
    {notice && <p role="status" className="client-account-notice">{notice}</p>}
    {(validationError || error) && <p role="alert" className="client-account-error">{validationError || error}</p>}
    {import.meta.env.DEV && <button type="button" className="secondary-button" onClick={onSwitchAdmin}>Admin</button>}
  </section>;
}

function ProfileForm({ busy, error, onActivate, session }) {
  const metadata = session.user.user_metadata || {};
  const names = String(metadata.full_name || metadata.name || "").trim().split(/\s+/);
  const [profile, setProfile] = useState({ first_name: names[0] || "", last_name: names.slice(1).join(" "), mobile: "" });
  const submit = (event) => { event.preventDefault(); void onActivate(profile); };
  return <section className="client-access-page" aria-label="Complete client profile">
    <p className="eyebrow">Your account</p><h1>Complete your profile</h1><p>These details are needed to arrange your appointment.</p>
    <form onSubmit={submit}>
      <label>First name<input required maxLength={100} value={profile.first_name} onChange={e => setProfile({...profile, first_name:e.target.value})} /></label>
      <label>Last name<input required maxLength={100} value={profile.last_name} onChange={e => setProfile({...profile, last_name:e.target.value})} /></label>
      <label>Mobile number<input required type="tel" maxLength={40} value={profile.mobile} onChange={e => setProfile({...profile, mobile:e.target.value})} /></label>
      <button disabled={busy}>{busy ? "Saving..." : "Continue"}</button>
    </form>{error && <p role="alert" className="client-account-error">{error}</p>}
  </section>;
}

function RecoveryForm({ busy, error, onUpdate }) {
  const [password, setPassword] = useState("");
  return <section className="client-access-page" aria-label="Reset client password"><h1>Choose a new password</h1>
    <form onSubmit={e => { e.preventDefault(); void onUpdate(password); }}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy || password.length < 8}>Update password</button></form>
    {error && <p role="alert" className="client-account-error">{error}</p>}
  </section>;
}

export function ClientPortal({ authLoading, authBusy = false, error, isAdmin, notice = "", onForgot, onGoogle, onPasswordUpdate, onSignIn, onSignOut, onSignUp, onSwitchAdmin, recovery, renderDestination, session }) {
  const initialDestination = new URLSearchParams(window.location.search).get("clientStep") === "my-bookings" ? "my-bookings" : "home";
  const [destination, setDestination] = useState(initialDestination);
  const [access, setAccess] = useState({ kind: "SESSION_LOADING" });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function refreshAccess() {
    if (!session?.user) { setAccess({ kind: "SIGNED_OUT" }); return; }
    if (isAdmin) { setAccess({ kind: "ERROR" }); return; }
    setAccess({ kind: "SESSION_LOADING" });
    const { data, error: accessError } = await supabase.rpc("get_my_client_access");
    if (accessError) { setLocalError("I couldn't check your account just now. Please try again."); setAccess({ kind: "ERROR" }); return; }
    if (data?.status === "BLOCKED") setAccess({ kind: "BLOCKED", data });
    else if (data?.status === "ACTIVE" && data?.profile_complete) setAccess({ kind: "ACTIVE", data });
    else setAccess({ kind: "PROFILE_REQUIRED", data });
  }
  useEffect(() => { if (!authLoading) void refreshAccess(); }, [authLoading, session?.user?.id, isAdmin]);
  async function activate(profile) {
    setBusy(true); setLocalError("");
    const { error: activationError } = await supabase.rpc("activate_my_client_account", { profile_fields: profile });
    setBusy(false);
    if (activationError) { setLocalError(activationError.message?.includes("blocked") ? BLOCKED_MESSAGE : "Please check your profile details and try again."); await refreshAccess(); return; }
    await refreshAccess();
  }
  if (authLoading || access.kind === "SESSION_LOADING") return <p className="client-account-loading" role="status">Checking your account...</p>;
  if (recovery && session?.user) return <RecoveryForm busy={busy} error={localError || error} onUpdate={onPasswordUpdate} />;
  if (!session?.user || access.kind === "SIGNED_OUT") return <AuthForm busy={busy || authBusy} error={error} notice={notice} onForgot={onForgot} onGoogle={onGoogle} onSignIn={onSignIn} onSignUp={onSignUp} onSwitchAdmin={onSwitchAdmin} />;
  if (access.kind === "PROFILE_REQUIRED") return <ProfileForm busy={busy} error={localError || error} onActivate={activate} session={session} />;
  if (access.kind === "ERROR") return <section className="client-access-page" role="alert"><h1>Account unavailable</h1><p>{isAdmin ? "This is an Admin account. Continue to the protected Admin area." : localError || "I couldn't check your account just now. Please try again."}</p>{isAdmin && <button type="button" onClick={onSwitchAdmin}>Continue to Admin</button>}<button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button></section>;
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
