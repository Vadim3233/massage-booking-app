import React from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Home,
  Leaf,
  MapPin,
  Moon,
  Sparkles,
  Waves,
} from "lucide-react";

const serviceIconMap = {
  "cloud-nine": Moon,
  "deep-tissue": Activity,
  prenatal: HeartPulse,
  sports: Waves,
  "zero-gravity": Sparkles,
};

export function AppShell({ children, className = "" }) {
  return <main className={`app-shell ${className}`.trim()}>{children}</main>;
}

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="ds-page-header">
      {eyebrow && <p>{eyebrow}</p>}
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button type="button" className={`ds-button ds-primary-button ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button type="button" className={`ds-button ds-secondary-button ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function SectionCard({ children, className = "" }) {
  return <section className={`ds-section-card ${className}`.trim()}>{children}</section>;
}

export function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`ds-status-badge ds-status-${tone}`}>{children}</span>;
}

export function EmptyState({ title, children }) {
  return (
    <div className="ds-empty-state">
      <Leaf aria-hidden="true" />
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

export function StepIndicator({ steps, activeStep }) {
  return (
    <nav className="ds-step-indicator" aria-label="Booking steps">
      {steps.map((step, index) => (
        <span className={step === activeStep ? "active-ds-step" : ""} key={step}>
          <i>{index + 1}</i>
          {step}
        </span>
      ))}
    </nav>
  );
}

export function ServiceCard({
  service,
  selected = false,
  selectedMinutes = 0,
  onSelect,
  onFullDescription,
}) {
  const Icon = serviceIconMap[service.id] ?? Sparkles;
  const durationCopy = "60 / 90 / 120 min";

  return (
    <article
      className={selected ? "premium-service-card selected-premium-service-card" : "premium-service-card"}
      onClick={onSelect}
    >
      <button type="button" className="premium-service-main" onClick={onSelect}>
        <span className="premium-service-icon" aria-hidden="true">
          <Icon size={22} strokeWidth={1.9} />
        </span>
        <span className="premium-service-copy">
          <strong>{service.name}</strong>
          <small>{service.shortDescription}</small>
        </span>
      </button>
      <div className="premium-service-meta">
        <span>
          <Clock3 size={15} aria-hidden="true" />
          {durationCopy}
        </span>
        <b>From {"\u00a3"}{service.price}</b>
      </div>
      {selectedMinutes > 0 && (
        <StatusBadge tone="success">{selectedMinutes} minutes selected</StatusBadge>
      )}
      <button
        type="button"
        className="premium-service-description"
        onClick={(event) => {
          event.stopPropagation();
          onFullDescription?.();
        }}
      >
        Full description
      </button>
    </article>
  );
}

export function BookingCard({ appointment, children }) {
  return (
    <article className="ds-booking-card">
      <div>
        <span>
          <CalendarDays size={16} aria-hidden="true" />
          {appointment.dateLabel}
        </span>
        <strong>{appointment.serviceName}</strong>
        {children}
      </div>
    </article>
  );
}

export function CheckoutSummary({ total, children }) {
  return (
    <section className="ds-checkout-summary">
      {children}
      <div>
        <span>Total</span>
        <strong>{"\u00a3"}{Number(total || 0).toFixed(2)}</strong>
      </div>
    </section>
  );
}

export const WellnessIcons = {
  CheckCircle2,
  Home,
  MapPin,
};
