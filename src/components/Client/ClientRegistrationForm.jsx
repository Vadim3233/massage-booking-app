import React, { useRef, useState } from "react";
import { Eye, EyeOff, MapPin, Hand, ShieldCheck } from "lucide-react";
import treatmentImage from "../../assets/massage-treatment-optimized.jpg";
import { validateClientRegistration, runSingleClientAuthSubmission, mapConfirmationResendError } from "../../lib/clientAuthValidation.js";

// Reuses the existing ClientLocationStep wordmark, not a new logo.
export function RegistrationBrand() {
  return <div className="location-brand-lockup reg-brand" aria-label="VadMassage"><span className="location-brand-mark">VM</span><strong>VadMassage</strong></div>;
}

export function ConfirmationPanel({ email, onResend, onDifferentEmail, onSignIn }) {
  const [sending, setSending] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const lock = useRef(false);
  const heading = useRef(null);
  React.useEffect(() => { heading.current?.focus(); }, []);
  React.useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (!retryAt) return undefined;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  async function resend() {
    if (lock.current || Date.now() < retryAt) return;
    setMessage(""); setFailed(false);
    try {
      await runSingleClientAuthSubmission(lock, () => onResend(email), setSending);
      setRetryAt(Date.now() + 60000);
      setMessage("Confirmation email requested. Please check your inbox and spam folder.");
    } catch (error) {
      setFailed(true);
      setMessage(mapConfirmationResendError(error));
      if (error?.status === 429 || String(error?.code).includes("rate_limit")) setRetryAt(Date.now() + 60000);
    }
  }
  return <section className="client-access-page reg-confirmation" aria-labelledby="confirmation-title">
    <RegistrationBrand />
    <h1 id="confirmation-title" tabIndex={-1} ref={heading}>Check your email</h1>
    <p>We sent a confirmation link to <strong>{email}</strong>. Confirm your email to finish creating your account.</p>
    <p className="reg-hint">If you already have an account, sign in instead. Check your spam folder if the email hasn’t arrived.</p>
    <button type="button" disabled={sending || remaining > 0} onClick={resend}>{sending ? "Sending…" : "Resend confirmation email"}</button>
    {remaining > 0 && <p className="reg-hint" role="status">You can resend in {remaining} seconds.</p>}
    {message && <p role={failed ? "alert" : "status"} className={failed ? "reg-error" : "reg-success"}>{message}</p>}
    <div className="client-account-button-row">
      <button type="button" disabled={sending} onClick={onDifferentEmail}>Use a different email</button>
      <button type="button" disabled={sending} onClick={onSignIn}>Sign in</button>
    </div>
  </section>;
}

const fieldSpecs = [
  ["firstName", "First name", "text", "given-name"],
  ["lastName", "Last name", "text", "family-name"],
  ["mobile", "Mobile number", "tel", "tel"],
  ["email", "Email address", "email", "email"],
  ["password", "Password", "password", "new-password"],
  ["confirmPassword", "Confirm password", "password", "new-password"],
];

export function ClientRegistrationForm({ externalError, busy, onSignUp, onSignIn, onGoogle, onConfirmation }) {
  const [fields, setFields] = useState({ firstName: "", lastName: "", mobile: "", email: "", password: "", confirmPassword: "" });
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [visible, setVisible] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef({});
  const errorRef = useRef(null);
  const lock = useRef(false);
  const validation = validateClientRegistration(fields);
  const isBusy = busy || submitting;
  async function submit(event) {
    event.preventDefault();
    if (isBusy || lock.current) return;
    setAttempted(true); setError("");
    if (!validation.valid) {
      const input = inputs.current[validation.firstInvalid];
      input?.focus(); input?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    try {
      const request = await runSingleClientAuthSubmission(lock, () => onSignUp(validation), setSubmitting);
      if (!request.started) return;
      if (request.value?.kind === "confirmation") onConfirmation(validation.email);
      else if (request.value?.kind === "existing") setError("An account with this email already exists. Sign in instead.");
      else if (request.value?.kind !== "authenticated") throw new Error("We couldn't create your account. Please try again.");
    } catch (failure) {
      setError(failure.message || "We couldn't create your account. Please try again.");
    }
  }
  React.useEffect(() => { if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: "nearest" }); } }, [error]);
  return <section className="client-access-page reg-layout" aria-labelledby="registration-title">
    <aside className="reg-aside">
      <img src={treatmentImage} alt="Massage treatment with a neatly prepared towel" />
      <div className="reg-aside-copy"><p className="reg-eyebrow">Care, wherever you are</p><h2>A little time.<br />Just for you.</h2>
        <ul>{[[MapPin, "At home, hotel or office", "I come to you"], [Hand, "Personalised treatment", "Tailored to your needs"], [ShieldCheck, "Your data stays private", "Safe and secure"]].map(([Icon, title, detail]) => <li key={title}><Icon size={21} aria-hidden="true" /><div><strong>{title}</strong><span>{detail}</span></div></li>)}</ul>
      </div>
    </aside>
    <div className="reg-card">
      <RegistrationBrand />
      <h1 id="registration-title">Create your account</h1>
      <p className="reg-intro">Create your account to book an appointment.</p>
      <button type="button" className="google-login-button" disabled={isBusy} onClick={onGoogle}><span aria-hidden="true">G</span> Continue with Google</button>
      <div className="reg-divider"><span>or register with email</span></div>
      <form noValidate onSubmit={submit} aria-busy={isBusy}>
        {fieldSpecs.map(([name, label, type, autocomplete]) => {
          const passwordField = type === "password";
          const showError = (attempted || touched[name] || (name === "confirmPassword" && fields.confirmPassword.length > 0)) && validation.errors[name];
          return <div className={name === "firstName" || name === "lastName" ? "reg-field reg-half" : "reg-field"} key={name}>
            <label htmlFor={"reg-" + name}>{label}</label>
            <div className="reg-input-wrap">
              <input id={"reg-" + name} name={name} ref={node => { inputs.current[name] = node; }} type={passwordField && visible[name] ? "text" : type} inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined} autoComplete={autocomplete} autoCapitalize={name === "email" || passwordField ? "none" : undefined} spellCheck={name === "email" || passwordField ? false : undefined} required maxLength={name === "mobile" ? 40 : name === "firstName" || name === "lastName" ? 100 : undefined} aria-invalid={Boolean(showError)} aria-describedby={showError ? "reg-" + name + "-error" : name === "password" ? "reg-password-hint" : undefined} value={fields[name]} onBlur={() => setTouched(previous => ({ ...previous, [name]: true }))} onChange={event => { setFields(previous => ({ ...previous, [name]: event.target.value })); setError(""); }} />
              {passwordField && <button type="button" className="reg-eye" aria-label={visible[name] ? "Hide password" : "Show password"} aria-controls={"reg-" + name} onClick={() => setVisible(previous => ({ ...previous, [name]: !previous[name] }))}>{visible[name] ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button>}
            </div>
            {name === "password" && !showError && <small id="reg-password-hint" className={fields.password.length >= 8 ? "reg-success" : "reg-hint"}>Use at least 8 characters.</small>}
            {showError && <small id={"reg-" + name + "-error"} className="reg-error" role="alert">{showError}</small>}
          </div>;
        })}
        <p className="reg-terms">By creating an account, you agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.</p>
        {(error || externalError) && <p ref={errorRef} tabIndex={-1} className="reg-error reg-form-error" role="alert">{error || externalError}</p>}
        <button type="submit" className="reg-submit" disabled={isBusy}>{isBusy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="client-account-switch">Already have an account? <button type="button" className="link-button" disabled={isBusy} onClick={onSignIn}>Sign in</button></p>
    </div>
  </section>;
}
