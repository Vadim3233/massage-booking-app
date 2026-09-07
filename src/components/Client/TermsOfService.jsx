import React from "react";
import "../../styles/clientAccess.css";

export function TermsOfService() {
  return (
    <main className="client-access-page legal-notice-page">
      <span className="client-access-brand">Vad Massage</span>
      <h1>Terms of Service</h1>
      <p className="client-access-muted">Last updated 7 September 2026</p>

      <p>These terms apply when you use the Vad Massage booking service to request and manage mobile massage or soft tissue therapy appointments.</p>

      <h2>Using the booking service</h2>
      <p>
        Online booking is available to invited or approved clients. Please use your own account, or have the person&apos;s authority if you arrange
        an appointment for them. Provide complete and accurate contact, address and appointment information, and keep it up to date.
      </p>

      <h2>Appointments</h2>
      <p>
        A booking request is subject to availability and confirmation. Travel requirements, the service area or another practical issue may mean
        a requested time cannot be accepted. Vad will contact you if an appointment needs to change.
      </p>

      <h2>Payment</h2>
      <p>
        You are responsible for the price shown for the appointment and any clearly stated travel or congestion charge. Bank transfer is the main
        payment method. Selecting “I&apos;ve made the bank transfer” records that you have sent payment; the booking remains awaiting verification until
        Vad confirms receipt. A request to pay cash is subject to approval and, once approved, payment is due on arrival.
      </p>

      <h2>Cancellation and rescheduling</h2>
      <p>
        Cancellation is normally free up to 24 hours before the appointment. A short grace period may also apply immediately after a booking is made,
        including for appointments booked within 24 hours. After the applicable free-cancellation period, a cancellation may be charged up to the full
        appointment fee depending on the circumstances. Rescheduling is subject to availability and the applicable notice period. Contact Vad promptly
        if the online management option is unavailable.
      </p>

      <h2>Your appointment</h2>
      <p>
        Please provide a safe and suitable place for a mobile appointment and tell Vad directly about information relevant to providing the treatment
        safely. Do not put medical details in the booking notes. The booking platform is an administrative service; it does not diagnose conditions,
        provide medical advice or replace advice from an appropriately qualified healthcare professional.
      </p>

      <h2>Fair use and account access</h2>
      <p>
        Please do not misuse the service, interfere with its operation, attempt to access another person&apos;s information or make false or speculative
        bookings. Vad may refuse a request or withdraw online booking access where reasonably necessary for safety, repeated misuse, unpaid amounts
        or the proper operation of the service. Existing appointments can still be discussed directly with Vad.
      </p>

      <h2>Availability of the platform</h2>
      <p>
        The booking service may occasionally be unavailable because of maintenance, provider outages or other technical problems. If that happens,
        contact Vad directly. Reasonable care is taken to keep booking information accurate, but online availability is not guaranteed until an
        appointment is confirmed.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        These terms may be updated when the booking service or applicable rules change. The current version and its update date will remain available
        on this page. Changes will apply to future use of the service and will not remove rights that already apply to a confirmed booking.
      </p>

      <h2>Contact</h2>
      <p>For booking questions or help with these terms, email <a href="mailto:bookings@vadmassage.com">bookings@vadmassage.com</a>.</p>

      <p className="legal-page-links"><a href="/?view=client">Return to booking</a><a href="/privacy">Privacy Notice</a></p>
    </main>
  );
}
