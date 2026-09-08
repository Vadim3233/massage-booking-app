import React from "react";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Star,
  WalletCards,
} from "lucide-react";
import {
  customerInitials,
  customerPreferredServiceShort,
  customerTotalSpent,
} from "../../lib/customerDisplay.js";
import { fullDateLabel } from "../../lib/dateTime.js";
import { AdminClientTelegramPanel } from "./AdminClientTelegramPanel.jsx";

export function AdminClientProfilePanel({
  activeSection,
  customer,
  deleteConfirmationDialog,
  editDraft,
  editOpen,
  formatMoney,
  noteSavedMessage,
  notesDraft,
  onBack,
  onBookCustomer,
  onCancelEdit,
  onChangeNotes,
  onChangeProfileDraft,
  onChangeSection,
  onContactCustomer,
  onDeleteCustomer,
  onDeleteNote,
  onSaveNotes,
  onSaveProfile,
  onStartAppointmentNote,
  onToggleEdit,
}) {
  if (!customer) return null;

  const noteEntries = customer.noteEntries || [];
  const noteDirty = Boolean(customer) && notesDraft.trim().length > 0;

  return (
    <article className="client-profile-screen">
      <header className="client-profile-topbar">
        <button type="button" onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={22} strokeWidth={2} />
          Back
        </button>
        <strong>Client Profile</strong>
        <button
          type="button"
          className="client-profile-edit-trigger"
          aria-label="Edit client profile"
          onClick={onToggleEdit}
        >
          <MoreHorizontal aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
      </header>

      <section className="client-profile-hero-card">
        <span className="client-avatar large" aria-hidden="true">
          {customer.avatarUrl ? <img src={customer.avatarUrl} alt="" /> : customerInitials(customer.name)}
        </span>
        <div className="client-profile-identity">
          <h2>{customer.name} {customer.appointments.length > 1 && <Star aria-hidden="true" size={18} strokeWidth={2.2} />}</h2>
          <p><Phone aria-hidden="true" size={16} strokeWidth={2} /> {customer.phone || "No phone saved"}</p>
          <p><Mail aria-hidden="true" size={16} strokeWidth={2} /> {customer.email || "No email saved"}</p>
          <p><MapPin aria-hidden="true" size={16} strokeWidth={2} /> {customer.address || "Address not captured yet"}</p>
        </div>
        <div className="client-profile-actions">
          <button type="button" onClick={() => onContactCustomer("call", customer)}>
            <Phone aria-hidden="true" size={19} strokeWidth={2} />
            Call
          </button>
          <button type="button" onClick={() => onContactCustomer("message", customer)}>
            <MessageCircle aria-hidden="true" size={19} strokeWidth={2} />
            Message
          </button>
          <button type="button" onClick={() => onContactCustomer("email", customer)}>
            <Mail aria-hidden="true" size={19} strokeWidth={2} />
            Email
          </button>
          <button type="button" className="client-book-button" onClick={() => onBookCustomer(customer)}>
            <CalendarDays aria-hidden="true" size={19} strokeWidth={2} />
            Book Appointment
          </button>
        </div>
      </section>

      <AdminClientTelegramPanel userId={customer.userId} />

      {editOpen && (
        <form className="client-profile-edit-panel" onSubmit={onSaveProfile}>
          <label>
            Name
            <input
              type="text"
              value={editDraft.name}
              onChange={(event) => onChangeProfileDraft("name", event.target.value)}
              required
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={editDraft.phone}
              onChange={(event) => onChangeProfileDraft("phone", event.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={editDraft.email}
              onChange={(event) => onChangeProfileDraft("email", event.target.value)}
            />
          </label>
          <label>
            Address
            <input
              type="text"
              value={editDraft.address}
              onChange={(event) => onChangeProfileDraft("address", event.target.value)}
            />
          </label>
          <label className="client-profile-edit-wide">
            Updates
            <textarea
              rows={2}
              value={editDraft.updates}
              onChange={(event) => onChangeProfileDraft("updates", event.target.value)}
            />
          </label>
          <div className="client-profile-edit-actions">
            <button type="submit">Save profile</button>
            <button type="button" onClick={onCancelEdit}>Cancel</button>
          </div>
          <button type="button" className="client-delete-profile-button" onClick={() => onDeleteCustomer(customer)}>
            x Delete client
          </button>
        </form>
      )}

      <div className="client-profile-metrics">
        <article>
          <CalendarDays aria-hidden="true" size={22} strokeWidth={2} />
          <span>Total App</span>
          <strong>{customer.appointments.length}</strong>
        </article>
        <article>
          <WalletCards aria-hidden="true" size={22} strokeWidth={2} />
          <span>Total</span>
          <strong>{formatMoney(customerTotalSpent(customer))}</strong>
        </article>
        <article>
          <Activity aria-hidden="true" size={22} strokeWidth={2} />
          <span>Pref</span>
          <strong>{customerPreferredServiceShort(customer)}</strong>
        </article>
      </div>

      <nav className="client-profile-tabs" aria-label="Client profile sections">
        {["appointments", "notes"].map((tab) => (
          <button
            type="button"
            className={activeSection === tab ? "active" : ""}
            key={tab}
            onClick={() => onChangeSection(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <section className="customer-profile client-appointments-card">
        {activeSection === "appointments" && <h3>Appointments</h3>}
          {activeSection === "notes" ? (
            <section className="client-notes-editor">
              <textarea
                aria-label={`Notes for ${customer.name}`}
                placeholder="Write a new note..."
                rows={4}
                value={notesDraft}
                onChange={(event) => onChangeNotes(event.target.value)}
              />
              <div className="client-notes-actions">
                <button type="button" onClick={onSaveNotes} disabled={!noteDirty}>
                  Save note
                </button>
                <small role="status">{noteSavedMessage || (noteDirty ? "Unsaved note" : "")}</small>
              </div>
              <div className="client-notes-list" aria-label="Saved client notes">
                {noteEntries.length === 0 ? (
                  <p>No notes saved yet.</p>
                ) : noteEntries.map((note) => {
                  const createdAt = note.createdAt ? new Date(note.createdAt) : null;
                  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
                    ? createdAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
                    : "No date";

                  return (
                    <article className="client-note-item" key={note.id}>
                      <div>
                        <time dateTime={note.createdAt || undefined}>{createdLabel}</time>
                        <p>{note.text}</p>
                      </div>
                      <button type="button" aria-label="Delete note" onClick={() => onDeleteNote(note.id)}>
                        x
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : customer.appointments.length === 0 ? (
            <p>No appointments yet.</p>
          ) : (
            customer.appointments.map((appointment) => (
              <div className="client-history-row" key={`${appointment.date}-${appointment.time}-${appointment.serviceName}`}>
                <span>{fullDateLabel(appointment.date)}</span>
                <strong>{appointment.serviceName}</strong>
                <small>{appointment.time} / {appointment.duration} min</small>
                <b>{appointment.paymentStatus || "Completed"}</b>
                <button type="button" className="client-history-note-button" onClick={() => onStartAppointmentNote(appointment)}>
                  Add note
                </button>
              </div>
            ))
          )}
      </section>

      {deleteConfirmationDialog}
    </article>
  );
}
