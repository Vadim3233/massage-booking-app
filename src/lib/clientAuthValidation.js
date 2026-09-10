export const CLIENT_PASSWORD_MIN_LENGTH = 6; // Existing sign-in credentials remain valid.
export const REGISTRATION_PASSWORD_MIN_LENGTH = 8;

export const CLIENT_AUTH_MESSAGES = Object.freeze({
  firstNameRequired: "Enter your first name.",
  lastNameRequired: "Enter your last name.",
  mobileRequired: "Enter your mobile number.",
  mobileInvalid: "Enter a valid mobile number.",
  emailRequired: "Enter your email address.",
  emailInvalid: "Enter a valid email address.",
  passwordRequired: "Enter a password.",
  passwordTooShort: `Password must be at least ${CLIENT_PASSWORD_MIN_LENGTH} characters.`,
  passwordsMismatch: "Passwords do not match.",
  registrationFailed: "We couldn't create your account. Please try again.",
  signInFailed: "We couldn't sign you in. Please check your email and password.",
});

export function normalizeClientEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateClientEmail(email) {
  const normalizedEmail = normalizeClientEmail(email);
  if (!normalizedEmail) return { valid: false, email: normalizedEmail, error: CLIENT_AUTH_MESSAGES.emailRequired };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { valid: false, email: normalizedEmail, error: CLIENT_AUTH_MESSAGES.emailInvalid };
  }
  return { valid: true, email: normalizedEmail, error: "" };
}

export function validateClientCredentials(email, password) {
  const emailValidation = validateClientEmail(email);
  const normalizedEmail = emailValidation.email;
  const passwordValue = String(password || "");

  if (!emailValidation.valid) return emailValidation;
  if (!passwordValue) return { valid: false, email: normalizedEmail, error: CLIENT_AUTH_MESSAGES.passwordRequired };
  if (passwordValue.length < CLIENT_PASSWORD_MIN_LENGTH) {
    return { valid: false, email: normalizedEmail, error: CLIENT_AUTH_MESSAGES.passwordTooShort };
  }
  return { valid: true, email: normalizedEmail, password: passwordValue, error: "" };
}

export function validateClientRegistration(fields = {}) {
  const { firstName, lastName, mobile, email, password, confirmPassword } = fields;
  const normalized = { firstName: String(firstName || "").trim(), lastName: String(lastName || "").trim(), mobile: String(mobile || "").trim(), email: normalizeClientEmail(email), password: String(password || "") };
  const errors = {};
  for (const [key, label] of [["firstName", "first name"], ["lastName", "last name"]]) {
    if (!normalized[key]) errors[key] = "Enter your " + label + ".";
    else if (normalized[key].length > 100 || /[\x00-\x1f\x7f]/.test(normalized[key])) errors[key] = "Enter a valid " + label + ".";
  }
  const digits = normalized.mobile.replace(/\D/g, "");
  if (!normalized.mobile) errors.mobile = CLIENT_AUTH_MESSAGES.mobileRequired;
  else if (normalized.mobile.length > 40 || digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits) || !/^\+?[\d\s().-]+$/.test(normalized.mobile)) errors.mobile = CLIENT_AUTH_MESSAGES.mobileInvalid;
  const emailResult = validateClientEmail(email);
  if (!emailResult.valid) errors.email = emailResult.error;
  if (normalized.password.length < REGISTRATION_PASSWORD_MIN_LENGTH) errors.password = "Password must be at least 8 characters.";
  if (String(confirmPassword || "") !== normalized.password || !confirmPassword) errors.confirmPassword = "Passwords do not match.";
  const firstInvalid = Object.keys(errors)[0];
  return { ...normalized, confirmPassword: String(confirmPassword || ""), errors, firstInvalid, valid: !firstInvalid, error: firstInvalid ? errors[firstInvalid] : "" };
}

export function classifySignupResult(data) {
  if (data?.session?.access_token && data.session.user?.id) return { kind: "authenticated" };
  if (data?.user?.id && data.session === null) {
    // Supabase may obscure a duplicate account with an empty identities array.
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) return { kind: "existing" };
    return { kind: "confirmation" };
  }
  throw new Error("Unexpected signup response");
}

export function clientNeedsEmailVerification(user) {
  return Boolean(user?.email) && !user?.email_confirmed_at;
}

export function isEmailConfirmationRequiredError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return code.includes("email_not_confirmed") || message.includes("email not confirmed");
}

export function mapClientRegistrationError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  if (code.includes("user_already_exists") || message.includes("already registered") || message.includes("already exists")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (code.includes("email_address_invalid") || message.includes("invalid email") || message.includes("email address is invalid")) {
    return CLIENT_AUTH_MESSAGES.emailInvalid;
  }
  if (code.includes("weak_password") || message.includes("weak password") || message.includes("password should be at least") || message.includes("password must be at least")) {
    return "Your password was rejected. Use at least 8 characters and avoid common passwords.";
  }
  if (code.includes("rate_limit") || error?.status === 429 || message.includes("rate limit")) return "Too many requests. Please wait a few minutes and try again.";
  if (message.includes("fetch") || message.includes("network") || message.includes("timeout")) return "Connection problem. Check your internet connection and try again.";
  return CLIENT_AUTH_MESSAGES.registrationFailed;
}

export function mapClientSignInError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  if (code.includes("email_address_invalid") || message.includes("invalid email") || message.includes("email address is invalid")) {
    return CLIENT_AUTH_MESSAGES.emailInvalid;
  }
  if (code.includes("invalid_credentials") || message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (isEmailConfirmationRequiredError(error)) return "Confirm your email before signing in. Check your inbox for the confirmation link.";
  return CLIENT_AUTH_MESSAGES.signInFailed;
}

export async function runSingleClientAuthSubmission(lock, action, setSubmitting = () => {}) {
  if (lock.current) return { started: false };
  lock.current = true;
  setSubmitting(true);
  try {
    return { started: true, value: await action() };
  } finally {
    lock.current = false;
    setSubmitting(false);
  }
}

export function mapConfirmationResendError(error) {
  const message = mapClientRegistrationError(error);
  return message === CLIENT_AUTH_MESSAGES.registrationFailed ? "We couldn't resend the confirmation email. Please try again." : message;
}
