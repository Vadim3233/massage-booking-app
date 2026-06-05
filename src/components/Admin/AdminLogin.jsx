import React, { useState } from "react";

export function AdminLogin({
  authError,
  authLoading,
  onBackClient,
  onLogin,
  onLogout,
  onRequestPasswordRecovery,
  onUpdatePassword,
  passwordRecovery,
  session,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const message = localError || authError;

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError("");

    try {
      await onLogin(email.trim(), password);
      setPassword("");
    } catch (error) {
      setLocalError(error.message || "Admin login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    setSubmitting(true);
    setLocalError("");

    try {
      await onLogout();
    } catch (error) {
      setLocalError(error.message || "Admin logout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    const recoveryEmail = email.trim();
    if (!recoveryEmail) {
      setLocalError("Enter your admin email first.");
      return;
    }

    setSubmitting(true);
    setLocalError("");
    setRecoveryMessage("");

    try {
      await onRequestPasswordRecovery(recoveryEmail);
      setRecoveryMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setLocalError(error.message || "Could not send password reset email.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setLocalError("New password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setLocalError("");

    try {
      await onUpdatePassword(newPassword);
      setNewPassword("");
      setRecoveryMessage("Password updated. You are signed in.");
    } catch (error) {
      setLocalError(error.message || "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={session && !passwordRecovery ? "admin-auth-panel admin-auth-panel-inline" : "admin-auth-panel"}>
      <div>
        <p className="eyebrow">Admin access</p>
        <h1>{passwordRecovery ? "Reset admin password" : session ? "Admin signed in" : "Admin login"}</h1>
        <p>{passwordRecovery ? "Enter a new password for this admin account." : session ? session.user?.email : "Sign in to view and manage bookings."}</p>
      </div>
      {authLoading ? (
        <p className="admin-auth-status">Checking session...</p>
      ) : passwordRecovery ? (
        <form className="admin-login-form" onSubmit={handlePasswordUpdate}>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          {message && <p className="admin-auth-error">{message}</p>}
          {recoveryMessage && <p className="admin-auth-success">{recoveryMessage}</p>}
          <div className="admin-auth-actions">
            <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save new password"}</button>
          </div>
        </form>
      ) : session ? (
        <div className="admin-auth-actions">
          <button type="button" onClick={handleLogout} disabled={submitting}>
            {submitting ? "Signing out..." : "Logout"}
          </button>
        </div>
      ) : (
        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {message && <p className="admin-auth-error">{message}</p>}
          {recoveryMessage && <p className="admin-auth-success">{recoveryMessage}</p>}
          <div className="admin-auth-actions">
            <button type="submit" disabled={submitting}>{submitting ? "Logging in..." : "Login"}</button>
            <button type="button" className="ghost-button" onClick={onBackClient}>Client view</button>
          </div>
          <button
            type="button"
            className="admin-forgot-password-link"
            onClick={handleForgotPassword}
            disabled={submitting}
          >
            Forgot your password?
          </button>
        </form>
      )}
    </section>
  );
}

