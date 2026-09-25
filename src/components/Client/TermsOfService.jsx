import React from "react";
import "../../styles/clientAccess.css";

export function TermsOfService() {
  return (
    <main className="client-access-page legal-notice-page">
      <span className="client-access-brand">Vad Massage</span>
      <h1>Terms of Service</h1>
      <p className="client-access-muted">Last updated 25 September 2026</p>

      <p>These terms apply when you use the Vad Massage booking service to request and manage mobile massage or soft tissue therapy appointments. The <a href="https://www.vadmassage.com/terms/">Booking &amp; Treatment Terms</a> explain the appointment, payment, cancellation and treatment rules that apply to your booking.</p>

      <h2>Using the booking service</h2>
      <p>
        Online booking is available to registered clients. Please use your own account, or have the person&apos;s authority if you arrange
        an appointment for them. Provide complete and accurate contact, address and appointment information, and keep it up to date.
      </p>

      <h2>Appointments</h2>
      <p>
        A booking request or held time is subject to availability and confirmation. Travel requirements, the service area or another practical issue may mean a requested time cannot be accepted. Vad will contact you if an appointment needs to change.
      </p>

      <h2>Payment</h2>
      <p>
        The total price, including any travel, congestion or other agreed location charge, is shown before you submit a request. Bank transfer in advance is the normal payment method. Selecting “I&apos;ve made the bank transfer” records that you say payment was sent; it does not confirm the booking or mark it paid. An appointment is confirmed once Vad has received payment and sent a confirmation message. Cash on arrival is available only if Vad expressly agrees and confirms your appointment.
      </p>

      <h2>Cancellation and rescheduling</h2>
      <p>
        You may cancel or reschedule without charge with at least 24 hours&apos; notice. With less than 24 hours&apos; notice, the full appointment fee is payable for a cancellation, reschedule or no-show, subject to the one-time illness reschedule, applicable statutory cancellation rights and a reduction where Vad fills the time or avoids costs. If cash on arrival was agreed, a late-cancellation fee is payable by bank transfer. The app may offer a short free-cancellation grace period after booking; if it does, you can use that additional option. Rescheduling remains subject to availability. See the <a href="https://www.vadmassage.com/terms/">full terms</a> and contact Vad promptly if online management is unavailable.
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
      <p>For booking questions or complaints, email <a href="mailto:bookings@vadmassage.com">bookings@vadmassage.com</a>. The <a href="https://www.vadmassage.com/terms/#complaints">complaints process</a> and postal correspondence details are in the full terms.</p>

      <p className="legal-page-links"><a href="/?view=client">Return to booking</a><a href="/privacy">Privacy Notice</a></p>
    </main>
  );
}
