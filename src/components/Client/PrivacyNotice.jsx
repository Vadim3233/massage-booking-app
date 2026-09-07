import React from "react";
import "../../styles/clientAccess.css";

export function PrivacyNotice() {
  return (
    <main className="client-access-page legal-notice-page">
      <span className="client-access-brand">Vad Massage</span>
      <h1>Privacy Notice</h1>
      <p className="client-access-muted">Last updated 7 September 2026</p>

      <p>
        Vad Massage is the data controller for personal information used to arrange and provide your massage appointments.
        For privacy questions or requests, email <a href="mailto:bookings@vadmassage.com">bookings@vadmassage.com</a>.
      </p>

      <h2>Information we use</h2>
      <ul>
        <li>Your name, email address, mobile number and account identifier.</li>
        <li>Your appointment choices, booking history, cancellations, waitlist requests and payment method or payment status.</li>
        <li>Your service address, postcode and any access instructions you provide for a mobile appointment.</li>
        <li>Your massage preferences and optional notes.</li>
        <li>Messages connected with your booking, including email and optional Telegram updates.</li>
        <li>Security and technical records needed to operate the booking service, such as authentication and request logs.</li>
      </ul>
      <p>
        The booking form does not ask for a medical history. Please do not put diagnoses or other medical details in the free-text notes.
        If you choose to share health information, it is special-category data. Vad will use it only where needed to provide the requested
        treatment safely and after obtaining your explicit consent, unless another legal condition applies.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To take steps at your request and provide your appointment under our contract with you.</li>
        <li>To communicate about bookings, payments, changes, cancellations and waitlist requests.</li>
        <li>For legitimate interests in running the service, preventing misuse, keeping the system secure and maintaining appropriate business records.</li>
        <li>To meet legal duties, including tax, accounting and data-protection obligations.</li>
      </ul>
      <p>We do not sell your personal information or use it for behavioural advertising.</p>

      <h2>Who processes it</h2>
      <p>
        The service uses Supabase for the database and authentication, Vercel for website and server hosting, and Resend for transactional email.
        Google processes sign-in information if you choose Google authentication. Telegram processes booking information where its admin
        notifications or optional client updates are enabled. These providers process information under their own security and contractual arrangements.
      </p>
      <p>
        Some providers or their subprocessors may process information outside the UK. Where UK data-protection law requires it, transfers are
        covered by an adequacy decision or approved contractual safeguards. You can ask for more information using the contact address above.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Account details, saved addresses and preferences are reviewed after 24 months without account or booking activity. Closed waitlist
        requests are normally removed after six months. Booking and payment records may be kept for up to six years where needed for tax,
        accounting, disputes or legal claims. Security, invitation and access records are reviewed at least annually and kept only while needed
        to protect the service and document access decisions. Provider request logs follow the provider retention settings in force at the time.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on the circumstances, you may ask for access to your information, correction, deletion, restriction, portability, or object to
        processing based on legitimate interests. You may withdraw consent at any time where consent is the basis for processing. Withdrawal does
        not affect earlier lawful use. Email the address above to make a request.
      </p>
      <p>
        You can also complain to the Information Commissioner&apos;s Office at <a href="https://ico.org.uk/make-a-complaint/" rel="noreferrer">ico.org.uk</a>.
        We would appreciate the chance to address your concern first.
      </p>

      <p className="legal-page-links"><a href="/?view=client">Return to booking</a><a href="/terms">Terms of Service</a></p>
    </main>
  );
}
