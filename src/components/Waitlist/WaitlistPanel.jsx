import React, { useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  UserRound,
} from "lucide-react";
import {
  DEFAULT_TRAVEL_BUFFER,
  getSchedulingPreview,
  minutesToTime,
} from "../../schedulingEngine.js";

const STATUS_TABS = [
  { id: "active", label: "Active" },
  { id: "offered", label: "Offered" },
  { id: "closed", label: "Closed" },
];

function initialsForName(name) {
  const parts = String(name || "Client").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

function formatDateValue(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "Date not set";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    + " / "
    + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function normalisedStatus(status) {
  if (status === "joined") return "active";
  if (status === "offered") return "offered";
  return "closed";
}

function statusLabel(status) {
  if (status === "joined") return "Active";
  if (status === "offered") return "Offered";
  if (status === "accepted") return "Accepted";
  return "Closed";
}

function contactValue(entry, keys) {
  for (const key of keys) {
    const value = entry?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function WaitlistPanel({
  days,
  getEffectiveWaitlistStatus,
  onCloseRequest,
  onSendOffer,
  services,
  slotMatchesWaitlistRequest,
  waitlistEntries,
}) {
  const [activeTab, setActiveTab] = useState("active");
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const visibleServices = services.filter((service) => service.visible);
  const enrichedEntries = useMemo(() => waitlistEntries.map((entry) => {
    const effectiveStatus = getEffectiveWaitlistStatus(entry);
    const preferredDayIndex = Math.max(0, days.findIndex((day) => day.dateValue === entry.preferredDate || day.label === entry.preferredDate));
    const preferredDay = days[preferredDayIndex] ?? days[0];
    const preview = getSchedulingPreview({
      settings: preferredDay?.settings ?? {},
      bookings: preferredDay?.bookings ?? [],
      requestedDuration: entry.duration,
      requestedTravelBuffer: DEFAULT_TRAVEL_BUFFER,
    });
    const matchingSlots = preview.slots.filter((slot) => slotMatchesWaitlistRequest(slot, entry));
    const selectedServiceId = entry.serviceId ?? visibleServices[0]?.id ?? services[0]?.id;
    const service = services.find((item) => item.id === selectedServiceId);
    const locked = effectiveStatus === "accepted" || effectiveStatus === "closed";

    return {
      ...entry,
      category: normalisedStatus(effectiveStatus),
      displayStatus: statusLabel(effectiveStatus),
      effectiveStatus,
      locked,
      matchingSlots,
      preferredDay,
      preferredDayIndex,
      selectedServiceId,
      serviceName: service?.name || entry.serviceName || "Treatment not selected",
    };
  }), [days, getEffectiveWaitlistStatus, services, slotMatchesWaitlistRequest, visibleServices, waitlistEntries]);

  const counts = STATUS_TABS.reduce((summary, tab) => {
    summary[tab.id] = enrichedEntries.filter((entry) => entry.category === tab.id).length;
    return summary;
  }, {});
  const visibleEntries = enrichedEntries
    .filter((entry) => entry.category === activeTab)
    .sort((first, second) => {
      if (first.category !== second.category) return first.category.localeCompare(second.category);
      return String(second.createdAt || "").localeCompare(String(first.createdAt || ""));
    });
  const selectedEntry = enrichedEntries.find((entry) => entry.id === selectedEntryId) ?? null;

  function sendFirstOffer(entry) {
    const slot = entry.matchingSlots[0];
    if (!slot || !entry.selectedServiceId) return;
    onSendOffer(entry.id, {
      dayIndex: entry.preferredDayIndex,
      dayLabel: entry.preferredDay?.label,
      serviceId: entry.selectedServiceId,
      slot,
    });
  }

  function contactHref(type, entry) {
    const phone = contactValue(entry, ["phone", "customerPhone", "clientPhone"]).replace(/\s+/g, "");
    const email = contactValue(entry, ["email", "customerEmail", "clientEmail"]);
    if (type === "call" && phone) return `tel:${phone}`;
    if (type === "message" && phone) return `sms:${phone}`;
    if (type === "email" && email) return `mailto:${email}`;
    return "";
  }

  function renderContactAction(type, entry, label, Icon) {
    const href = contactHref(type, entry);
    const disabled = !href;

    return disabled ? (
      <button type="button" disabled title={`${label} unavailable until contact details are saved`}>
        <Icon aria-hidden="true" size={21} strokeWidth={2} />
        {label}
      </button>
    ) : (
      <a href={href}>
        <Icon aria-hidden="true" size={21} strokeWidth={2} />
        {label}
      </a>
    );
  }

  function renderEntryCard(entry) {
    const canOffer = entry.effectiveStatus === "joined" && entry.matchingSlots.length > 0 && entry.selectedServiceId;
    const messageHref = contactHref("message", entry);

    return (
      <article className="waitlist-admin-card waitlist-request-card" key={entry.id}>
        <button type="button" className="waitlist-card-open" onClick={() => setSelectedEntryId(entry.id)}>
          <span className="waitlist-avatar" aria-hidden="true">{initialsForName(entry.clientName)}</span>
          <span className="waitlist-card-main">
            <span className="waitlist-card-title-row">
              <strong>{entry.clientName || "Client"}</strong>
              <b className={`waitlist-status-badge waitlist-status-${entry.category}`}>{entry.displayStatus}</b>
            </span>
            <span><CalendarDays aria-hidden="true" size={16} /> {formatDateValue(entry.preferredDate)} / {entry.preferredWindow || "Any time"}</span>
            <span><Clock3 aria-hidden="true" size={16} /> {entry.duration || 0} min / {entry.serviceName}</span>
            <small>Flexibility: +/- {entry.flexibility || 0} min</small>
          </span>
          <ChevronRight aria-hidden="true" size={22} strokeWidth={2} />
        </button>
        <div className="waitlist-card-actions">
          <button
            type="button"
            disabled={!canOffer}
            title={canOffer ? "Offer the first matching slot" : "No matching slot available"}
            onClick={() => sendFirstOffer(entry)}
          >
            <CalendarCheck aria-hidden="true" size={19} strokeWidth={2} />
            Offer slot
          </button>
          {messageHref ? (
            <a href={messageHref}>
              <MessageCircle aria-hidden="true" size={19} strokeWidth={2} />
              Message
            </a>
          ) : (
            <button type="button" disabled title="No phone number saved">
              <MessageCircle aria-hidden="true" size={19} strokeWidth={2} />
              Message
            </button>
          )}
          <button type="button" onClick={() => setSelectedEntryId(entry.id)}>
            <MoreHorizontal aria-hidden="true" size={20} strokeWidth={2} />
            More
          </button>
        </div>
      </article>
    );
  }

  function renderDetail(entry) {
    const phone = contactValue(entry, ["phone", "customerPhone", "clientPhone"]);
    const email = contactValue(entry, ["email", "customerEmail", "clientEmail"]);
    const address = contactValue(entry, ["address", "area", "location", "clientAddress"]);
    const canOffer = entry.effectiveStatus === "joined" && entry.matchingSlots.length > 0 && entry.selectedServiceId;

    return (
      <section className="waitlist-detail-screen">
        <header className="waitlist-detail-topbar">
          <button type="button" onClick={() => setSelectedEntryId(null)}>
            <ChevronLeft aria-hidden="true" size={22} strokeWidth={2} />
            Back
          </button>
          <strong>Waitlist request</strong>
          {entry.locked ? (
            <span className="waitlist-detail-closed">Closed</span>
          ) : (
            <button type="button" className="waitlist-close-link" onClick={() => onCloseRequest(entry.id)}>
              Close request
            </button>
          )}
        </header>

        <section className="waitlist-detail-client-card">
          <span className="waitlist-avatar large" aria-hidden="true">{initialsForName(entry.clientName)}</span>
          <div>
            <h3>{entry.clientName || "Client"}</h3>
            <p><Phone aria-hidden="true" size={16} /> {phone || "No phone saved"}</p>
            <p><Mail aria-hidden="true" size={16} /> {email || "No email saved"}</p>
            <p><UserRound aria-hidden="true" size={16} /> {address || "Area not captured"}</p>
          </div>
          <b className={`waitlist-status-badge waitlist-status-${entry.category}`}>{entry.displayStatus}</b>
        </section>

        <div className="waitlist-detail-actions">
          <button type="button" disabled={!canOffer} onClick={() => sendFirstOffer(entry)}>
            <CalendarCheck aria-hidden="true" size={22} strokeWidth={2} />
            Offer slot
          </button>
          {renderContactAction("message", entry, "Message", MessageCircle)}
          {renderContactAction("call", entry, "Call", Phone)}
          {renderContactAction("email", entry, "Email", Mail)}
        </div>

        <section className="waitlist-detail-card">
          <h3>Request details</h3>
          <dl className="waitlist-detail-list">
            <div><dt>Requested date & time</dt><dd>{formatDateValue(entry.preferredDate)} / {entry.preferredWindow || "Any time"}</dd></div>
            <div><dt>Duration</dt><dd>{entry.duration || 0} minutes</dd></div>
            <div><dt>Service</dt><dd>{entry.serviceName}</dd></div>
            <div><dt>Flexibility</dt><dd>+/- {entry.flexibility || 0} minutes</dd></div>
            <div><dt>Notes</dt><dd>{entry.notes || entry.note || "No notes saved."}</dd></div>
          </dl>
        </section>

        <section className="waitlist-detail-card waitlist-history-card">
          <h3>History</h3>
          <div className="waitlist-activity-row">
            <span aria-hidden="true" />
            <div>
              <strong>Request created</strong>
              <small>{formatTimestamp(entry.createdAt) || "Creation time not recorded"}</small>
            </div>
          </div>
          {entry.offeredSlot && (
            <div className="waitlist-activity-row">
              <span aria-hidden="true" />
              <div>
                <strong>Offer sent</strong>
                <small>{entry.offeredDayLabel || entry.preferredDay?.label} at {minutesToTime(entry.offeredSlot.start)}</small>
              </div>
            </div>
          )}
          {entry.locked && (
            <div className="waitlist-activity-row">
              <span aria-hidden="true" />
              <div>
                <strong>Request closed</strong>
                <small>Status: {entry.displayStatus}</small>
              </div>
            </div>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="waitlist-panel waitlist-workflow">
      {selectedEntry ? renderDetail(selectedEntry) : (
        <>
          <div className="waitlist-list-header">
            <div>
              <p>Waitlist</p>
              <h2>Waitlist</h2>
            </div>
          </div>

          <nav className="waitlist-status-tabs" aria-label="Waitlist status">
            {STATUS_TABS.map((tab) => (
              <button
                type="button"
                className={activeTab === tab.id ? "active" : ""}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                <span>{counts[tab.id] || 0}</span>
              </button>
            ))}
          </nav>

          <div className="waitlist-section-copy">
            <h3>{STATUS_TABS.find((tab) => tab.id === activeTab)?.label} requests</h3>
            <p>
              {activeTab === "active" && "Clients waiting for an appointment."}
              {activeTab === "offered" && "Slots offered to clients."}
              {activeTab === "closed" && "Closed or completed requests."}
            </p>
          </div>

          <div className="waitlist-admin-list">
            {visibleEntries.length === 0 ? (
              <div className="waitlist-empty-state">
                <strong>No {activeTab} requests.</strong>
                <p>New waitlist requests will appear here when clients cannot find a suitable slot.</p>
              </div>
            ) : visibleEntries.map(renderEntryCard)}
          </div>
        </>
      )}
    </section>
  );
}
