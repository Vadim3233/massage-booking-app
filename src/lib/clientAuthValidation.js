export const CLIENT_PASSWORD_MIN_LENGTH = 6;

export const CLIENT_AUTH_MESSAGES = Object.freeze({
  emailRequired: "Enter your email address.",
  emailInvalid: "Enter a valid email address.",
  passwordRequired: "Enter a password.",
  passwordTooShort: `Password must be at least ${CLIENT_PASSWORD_MIN_LENGTH} characters.`,
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
    return CLIENT_AUTH_MESSAGES.passwordTooShort;
  }
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
