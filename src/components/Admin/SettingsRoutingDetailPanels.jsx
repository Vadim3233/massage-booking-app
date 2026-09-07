import React from "react";
import { SettingsDetailPanel } from "./SettingsDetailPanel.jsx";

export function SettingsRoutingDetailPanels({
  activeCategoryId,
  selectedSection,
  allCustomers,
  bankDetailCount,
  days,
  getWaitlistStatus,
  isDevelopmentMode,
  onOpenAdminTab,
  onOpenBlockedTime,
  onOpenSettingsSection,
  onOpenSettingsSubsection,
  serviceAreas,
  waitlistEntries,
}) {
  if (activeCategoryId === "scheduling" && selectedSection === "Blocked Time") {
    const personalEventCount = days.reduce((count, day) => (
      count + day.bookings.filter((booking) => booking?.kind === "personal" || booking?.serviceId === "personal-event").length
    ), 0);
    return (
      <SettingsDetailPanel
        title="Blocked Time"
        description="Use personal events to block time for breaks, travel, holidays, errands, and any appointment you do not want clients to book over."
        items={[
        { title: "How it works", body: "Blocked time appears in your calendar and is respected by availability checks when clients choose a slot." },
        { title: "Current blocks", body: `${personalEventCount} personal block${personalEventCount === 1 ? "" : "s"} currently loaded in the calendar.` },
        { title: "Best place to add it", body: "Add blocked time from the calendar so it lands on the exact date and time you need." },
        ]}
        actions={(
        <button type="button" className="admin-primary-action" onClick={() => onOpenBlockedTime()}>
          Add blocked time from calendar
        </button>
        )}
      />
    );
  }

  if (activeCategoryId === "coverage") {
    if (selectedSection === "Coverage Rules") {
      const activeAreas = serviceAreas.filter((area) => area.active !== false);
      return (
        <div className="settings-placeholder">
          <h3>Coverage Rules</h3>
          <p>Only active named service areas are shown to clients during booking.</p>
          <p>
            {activeAreas.length > 0
              ? `Currently available: ${activeAreas.map((area) => area.name).join(", ")}.`
              : "No service areas are currently available to clients."}
          </p>
          <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSection("admin-service-areas", "coverage")}>
            Manage service areas
          </button>
        </div>
      );
    }

    if (selectedSection === "Travel Charges") {
      return (
        <div className="settings-placeholder">
          <h3>Travel Charges</h3>
          <p>Travel surcharges are configured manually for each named service area.</p>
          <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSection("admin-service-areas", "coverage")}>
            Manage area fees
          </button>
        </div>
      );
    }

    if (selectedSection === "Congestion Zone Fee") {
      return (
        <div className="settings-placeholder">
          <h3>Congestion Zone Fee</h3>
          <p>Congestion fees are configured manually per service area.</p>
          <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSection("admin-service-areas", "coverage")}>
            Manage area fees
          </button>
        </div>
      );
    }
  }

  if (activeCategoryId === "waitlist" && selectedSection === "Waitlist Rules") {
    return (
      <div className="settings-placeholder">
        <h3>Waitlist Rules</h3>
        <p>Existing requests match by date, treatment duration, preferred time or window, and the client&apos;s flexibility.</p>
        <p>Past requests close automatically. Offers remain a manual admin action in the Waitlist view.</p>
        <p>Offer expiry is handled manually during launch.</p>
        <button
          type="button"
          className="admin-secondary-action"
          onClick={() => onOpenAdminTab("waitlist", "waitlist")}
        >
          Open waitlist requests
        </button>
      </div>
    );
  }

  if (activeCategoryId === "waitlist" && selectedSection === "Client Requests") {
    const openRequests = waitlistEntries.filter((entry) => getWaitlistStatus(entry) === "joined").length;
    const offeredRequests = waitlistEntries.filter((entry) => getWaitlistStatus(entry) === "offered").length;
    return (
      <SettingsDetailPanel
        title="Client Requests"
        description="All active waitlist requests are managed from the Waitlist screen, where you can send offers and close requests."
        items={[
        { title: "Waiting", body: `${openRequests} request${openRequests === 1 ? "" : "s"} waiting for a matching slot.` },
        { title: "Offered", body: `${offeredRequests} offer${offeredRequests === 1 ? "" : "s"} currently sent to clients.` },
        { title: "Matching", body: "Requests use date, duration, preferred time or window, and flexibility to suggest suitable openings." },
        ]}
        actions={(
        <button type="button" className="admin-primary-action" onClick={() => onOpenAdminTab("waitlist", "waitlist")}>
          Open waitlist requests
        </button>
        )}
      />
    );
  }

  if (activeCategoryId === "waitlist" && selectedSection === "Offer Settings") {
    return (
      <SettingsDetailPanel
        title="Offer Settings"
        description="Waitlist offers are currently sent manually so you stay in control of the diary while the system is still being tuned."
        items={[
        { title: "Manual approval", body: "You choose which available slot to offer before a client receives it." },
        { title: "Client response", body: "Clients can accept an offer from their waitlist view while the slot is still available." },
        { title: "Safety", body: "If the slot is no longer available, the offer cannot create a conflicting booking." },
        ]}
        actions={(
        <button type="button" className="admin-secondary-action" onClick={() => onOpenAdminTab("waitlist", "waitlist")}>
          Review offer queue
        </button>
        )}
      />
    );
  }

  if (activeCategoryId === "payments") {
    const awaitingVerification = days.reduce((count, day) => (
      count + day.bookings.filter((booking) => booking.paymentStatus === "awaiting_verification").length
    ), 0);
    const cashRequests = days.reduce((count, day) => (
      count + day.bookings.filter((booking) => booking.paymentStatus === "cash_on_arrival").length
    ), 0);
    if (selectedSection === "Payment Methods") {
      return (
        <SettingsDetailPanel
          title="Payment Methods"
          description="Bank transfer is the primary payment method. Cash is available only after the client reads and acknowledges the cash payment note."
          items={[
          { title: "Bank transfer", body: `Clients see ${bankDetailCount} bank detail rows with copy buttons and a payment reference.` },
          { title: "Cash on arrival", body: "Cash requests stay awaiting approval until you review them from the booking record." },
          { title: "Card payments", body: "Card processing is not shown because no card provider is connected in this app." },
          ]}
          actions={(
          <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSubsection("payments", "Payment Statuses")}>
            Review payment statuses
          </button>
          )}
        />
      );
    }
    if (selectedSection === "Payment Statuses") {
      return (
        <SettingsDetailPanel
          title="Payment Statuses"
          description="Payment status is controlled from bookings. A client saying they made a transfer does not mark the booking as paid."
          items={[
          { title: "Awaiting verification", body: `${awaitingVerification} booking${awaitingVerification === 1 ? "" : "s"} waiting for bank-transfer verification.` },
          { title: "Cash requests", body: `${cashRequests} booking${cashRequests === 1 ? "" : "s"} waiting for cash-arrival approval or confirmation.` },
          { title: "Admin control", body: "Use booking details in Calendar to approve cash requests, mark transfer received, or cancel/reject." },
          ]}
          actions={(
          <button type="button" className="admin-primary-action" onClick={() => onOpenAdminTab("pending", null)}>
            Open pending bookings
          </button>
          )}
        />
      );
    }
    if (selectedSection === "Pay Later") {
      return (
        <SettingsDetailPanel
          title="Pay Later"
          description="Pay-later wording is kept conservative. Bookings should still remain clear about whether payment is awaiting verification or due on arrival."
          items={[
          { title: "Bank transfer first", body: "Clients are guided to complete bank transfer before final confirmation." },
          { title: "Cash exception", body: "Cash is treated as a request, not an automatic confirmation." },
          { title: "Receipts", body: "Receipt and invoice wording is managed under Receipts & Documents." },
          ]}
          actions={(
          <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSubsection("documents", "Invoice Settings")}>
            Open invoice settings
          </button>
          )}
        />
      );
    }
  }

  if (activeCategoryId === "notifications" && selectedSection === "Email") {
    return (
      <SettingsDetailPanel
        title="Email"
        description="Email delivery uses the existing server templates and booking events. Keep content calm and client-friendly."
        items={[
        { title: "Booking emails", body: "Booking confirmation and payment-related copy comes from the current email template layer." },
        { title: "Receipts", body: "Receipt email wording is edited under Receipts & Documents." },
        { title: "Sender details", body: "Business email and document identity are managed in Business Details." },
        ]}
        actions={(
        <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSubsection("documents", "Email Receipt Template")}>
          Open receipt email template
        </button>
        )}
      />
    );
  }

  if (activeCategoryId === "notifications" && selectedSection === "Booking Alerts") {
    return (
      <SettingsDetailPanel
        title="Booking Alerts"
        description="Booking alerts should help you review new bookings without changing payment or approval rules."
        items={[
        { title: "New bank-transfer booking", body: "Client bookings remain awaiting verification until you check payment." },
        { title: "Cash request", body: "Cash requests are shown as awaiting approval so they can be reviewed deliberately." },
        { title: "Waitlist offer", body: "Waitlist offers remain controlled from the Waitlist screen." },
        ]}
        actions={(
        <button type="button" className="admin-primary-action" onClick={() => onOpenAdminTab("calendar", null)}>
          Open bookings
        </button>
        )}
      />
    );
  }

  if (activeCategoryId === "clients") {
    const returningClients = allCustomers.filter((customer) => customer.appointments.length > 1).length;
    if (selectedSection === "Client Details") {
      return (
        <SettingsDetailPanel
          title="Client Details"
          description="Client records are built from bookings, notes, and saved profile edits."
          items={[
          { title: "Clients loaded", body: `${allCustomers.length} client profile${allCustomers.length === 1 ? "" : "s"} currently available.` },
          { title: "Notes", body: "Admin notes are private and can be added from each client profile." },
          { title: "Privacy", body: "Client data should only be used for booking, contact, and appointment care." },
          ]}
          actions={(
          <button type="button" className="admin-primary-action" onClick={() => onOpenAdminTab("customers", null)}>
            Open client list
          </button>
          )}
        />
      );
    }
    if (selectedSection === "Returning Clients") {
      return (
        <SettingsDetailPanel
          title="Returning Clients"
          description="Returning client behaviour is based on booking history and saved client profiles."
          items={[
          { title: "Returning clients", body: `${returningClients} client${returningClients === 1 ? "" : "s"} have more than one appointment.` },
          { title: "Book again", body: "Client portal actions can reuse previous booking details where available." },
          { title: "Saved details", body: "Client-facing wording avoids making saved details feel intrusive." },
          ]}
          actions={(
          <button type="button" className="admin-secondary-action" onClick={() => onOpenAdminTab("customers", null)}>
            View returning clients
          </button>
          )}
        />
      );
    }
    if (selectedSection === "Rebooking Preferences") {
      return (
        <SettingsDetailPanel
          title="Rebooking Preferences"
          description="Rebooking is designed to be quick without bypassing normal availability, payment, and approval checks."
          items={[
          { title: "Availability first", body: "Rebooking still checks live availability and travel-buffer rules." },
          { title: "Payment rules", body: "Bank transfer and cash request rules remain unchanged for returning clients." },
          { title: "Client control", body: "Clients can review details before submitting a new booking." },
          ]}
          actions={(
          <button type="button" className="admin-secondary-action" onClick={() => onOpenAdminTab("customers", null)}>
            Open client records
          </button>
          )}
        />
      );
    }
  }

  if (activeCategoryId === "security" && selectedSection === "Client Privacy") {
    return (
      <SettingsDetailPanel
        title="Client Privacy"
        description="Client details should stay minimal, practical, and used only for appointment care."
        items={[
        { title: "Stored booking details", body: "Name, contact details, address, notes, booking reference, and payment state support the appointment." },
        { title: "Private admin notes", body: "Client notes are admin-facing and should not appear in the public booking journey." },
        { title: "Client wording", body: "The client UI avoids heavy wording like details being saved unless it is needed." },
        ]}
      />
    );
  }

  if (activeCategoryId === "security" && selectedSection === "API Protection") {
    return (
      <SettingsDetailPanel
        title="API Protection"
        description="Sensitive server actions should remain behind environment-backed secrets and Supabase security."
        items={[
        { title: "No frontend secrets", body: "Service role keys and private API secrets must never be placed in frontend code." },
        { title: "Server routes", body: "Email, Telegram, and admin-only actions should continue using protected server paths." },
        { title: "Tests", body: "Existing API secret protection tests cover the current safety assumptions." },
        ]}
      />
    );
  }

  if (activeCategoryId === "system" && selectedSection === "Integrations") {
    return (
      <SettingsDetailPanel
        title="Integrations"
        description="External services are connected through the existing app/server configuration."
        items={[
        { title: "Supabase", body: "Authentication, booking persistence, and protected database functions remain the core backend." },
        { title: "Telegram", body: "Telegram tests are available from Notifications." },
        { title: "Documents", body: "Receipt and invoice details are configured under Receipts & Documents." },
        ]}
        actions={(
        <button type="button" className="admin-secondary-action" onClick={() => onOpenSettingsSubsection("notifications", "Telegram")}>
          Open Telegram settings
        </button>
        )}
      />
    );
  }

  if (activeCategoryId === "system" && selectedSection === "Application Information") {
    return (
      <SettingsDetailPanel
        title="Application Information"
        description="This app contains the public client booking flow and the protected admin workspace."
        items={[
        { title: "Client flow", body: "Area, Treatment, Duration, Date & Time, Review, Your Details, Payment, Confirmation." },
        { title: "Admin modules", body: "Calendar, Clients, Waitlist, Analytics, Settings, and service management." },
        { title: "Environment", body: isDevelopmentMode ? "Development mode is active." : "Production build mode." },
        ]}
      />
    );
  }

  return null;
}
