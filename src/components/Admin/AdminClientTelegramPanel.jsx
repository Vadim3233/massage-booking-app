import React, { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/bookingSupabase.js";
import { buildTelegramActivationUrl, normalizeTelegramBotUrl } from "../../lib/telegramLinks.js";

const BOT_URL = normalizeTelegramBotUrl(import.meta.env?.VITE_TELEGRAM_BOT_URL);

export function AdminClientTelegramView({
  activationLink = "", botConfigured = true, busy = false, confirmation = "", expiry = "",
  message = "", onConfirm = () => {}, onCopy = () => {}, onCreate = () => {}, onRetry = () => {},
  onSetConfirmation = () => {}, status = null,
}) {
  const statusClass = String(status?.state || "loading").toLowerCase();
  return <section className="client-telegram-section" aria-label="Telegram connection">
    <div className="client-telegram-heading"><h3>Telegram</h3>
      <strong className={"client-telegram-status " + statusClass}>
        {!status ? "Checking..." : status.state === "CONNECTED" ? "Connected" : status.state === "PENDING" ? "Invitation pending" : "Not connected"}
      </strong>
    </div>
    {status?.state === "NO_ACCOUNT" && <p>Telegram account linking is available after this client has an authenticated account.</p>}
    {status?.state === "CONNECTED" && <>
      {status.username && <p>Username: @{status.username}</p>}
      {status.linked_at && <p>Connected {new Date(status.linked_at).toLocaleString()}</p>}
      <button type="button" disabled={busy} onClick={() => onSetConfirmation("disconnect")}>Disconnect Telegram</button>
    </>}
    {status?.state === "PENDING" && <>
      <p>Expires {expiry}</p>
      {activationLink && <div className="client-telegram-link"><input aria-label="Telegram activation link" readOnly value={activationLink} onFocus={(event) => event.target.select()} /><button type="button" disabled={busy} onClick={onCopy}>Copy activation link</button></div>}
      {!activationLink && <p className="admin-muted-note">The link is only available when it is created.</p>}
      <button type="button" disabled={busy} onClick={() => onSetConfirmation("revoke")}>Revoke invitation</button>
    </>}
    {["NOT_CONNECTED", "ERROR"].includes(status?.state) && <button type="button" disabled={busy || !botConfigured} onClick={onCreate}>Create Telegram activation link</button>}
    {status?.state === "ERROR" && <button type="button" disabled={busy} onClick={onRetry}>Retry</button>}
    {!botConfigured && status?.state !== "NO_ACCOUNT" && <p role="alert">Telegram activation links are unavailable until the public bot URL is configured.</p>}
    {message && <p role="status">{message}</p>}
    {confirmation && <div className="client-telegram-confirm" role="alertdialog" aria-modal="true" aria-label={confirmation === "disconnect" ? "Confirm Telegram disconnect" : "Confirm Telegram invitation revocation"}>
      <h4>{confirmation === "disconnect" ? "Disconnect Telegram?" : "Revoke this activation link?"}</h4>
      <p>{confirmation === "disconnect" ? "Future Telegram messages to this connection will stop. The client account and bookings stay intact." : "The current activation link will stop working."}</p>
      <button type="button" disabled={busy} onClick={onConfirm}>Confirm</button>
      <button type="button" disabled={busy} onClick={() => onSetConfirmation("")}>Cancel</button>
    </div>}
  </section>;
}

export function AdminClientTelegramPanel({ userId, suppliedClient = null }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activationLink, setActivationLink] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const generation = useRef(0);
  const client = () => suppliedClient ? Promise.resolve(suppliedClient) : getSupabaseClient();

  async function rpc(name, args) {
    const connection = await client();
    const { data, error } = await connection.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function load() {
    if (!userId) { setStatus({ state: "NO_ACCOUNT" }); return; }
    const version = ++generation.current;
    setStatus(null);
    try {
      const data = await rpc("admin_get_client_telegram_status", { target_user_id: userId });
      if (generation.current === version) setStatus(data || { state: "NOT_CONNECTED" });
    } catch {
      if (generation.current === version) {
        setStatus({ state: "ERROR" });
        setMessage("Telegram status could not be loaded. Please try again.");
      }
    }
  }

  useEffect(() => {
    setMessage(""); setActivationLink(""); setConfirmation(""); void load();
    return () => { generation.current += 1; };
  }, [userId, suppliedClient]);

  async function createInvitation() {
    if (busy || !BOT_URL) return;
    setBusy(true); setMessage(""); setActivationLink("");
    try {
      const data = await rpc("admin_create_client_telegram_invitation", { target_user_id: userId });
      const link = buildTelegramActivationUrl(BOT_URL, data?.token);
      if (!link) throw new Error("invalid activation response");
      setActivationLink(link);
      setStatus({ state: "PENDING", invitation_id: data.id, expires_at: data.expires_at });
      setMessage("Activation link created. Copy it now; it cannot be recovered later.");
    } catch { setMessage("The activation link could not be created. Please try again."); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(activationLink);
      setActivationLink("");
      setMessage("Activation link copied and cleared from this screen.");
    } catch { setMessage("Copy is unavailable. Select and copy the link manually."); }
  }

  async function applyConfirmedAction() {
    if (busy || !confirmation) return;
    setBusy(true); setMessage(""); setActivationLink("");
    try {
      if (confirmation === "revoke") {
        await rpc("admin_revoke_client_telegram_invitation", { invitation_id: status.invitation_id });
        setMessage("Telegram invitation revoked.");
      } else {
        await rpc("admin_disconnect_client_telegram", { target_user_id: userId });
        setMessage("Telegram disconnected. The client account and bookings are unchanged.");
      }
      setConfirmation("");
      await load();
    } catch { setMessage("The change could not be confirmed. Refresh the status and try again."); }
    finally { setBusy(false); }
  }

  const expiry = status?.expires_at ? new Date(status.expires_at).toLocaleString() : "";
  return <AdminClientTelegramView activationLink={activationLink} botConfigured={Boolean(BOT_URL)} busy={busy}
    confirmation={confirmation} expiry={expiry} message={message} onConfirm={applyConfirmedAction}
    onCopy={copyLink} onCreate={createInvitation} onRetry={load} onSetConfirmation={setConfirmation} status={status} />;
}
