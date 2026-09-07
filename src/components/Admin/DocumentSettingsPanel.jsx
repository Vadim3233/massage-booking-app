import React from "react";

function renderDocumentTextField(documentSettings, onUpdateDocumentSetting, key, label, { multiline = false, type = "text", hint = "" } = {}) {
  const value = documentSettings[key] ?? "";
  return (
    <label className={multiline ? "document-setting-field document-setting-wide" : "document-setting-field"}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(event) => onUpdateDocumentSetting(key, event.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onUpdateDocumentSetting(key, event.target.value)}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function renderDocumentSelectField(documentSettings, onUpdateDocumentSetting, key, label, options, { hint = "" } = {}) {
  const value = documentSettings[key] ?? "";
  return (
    <label className="document-setting-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onUpdateDocumentSetting(key, event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function renderDocumentToggle(documentSettings, onUpdateDocumentSetting, key, label, hint = "") {
  return (
    <label className="document-setting-toggle">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={Boolean(documentSettings[key])}
        onChange={(event) => onUpdateDocumentSetting(key, event.target.checked)}
      />
    </label>
  );
}

function renderDocumentGroup(title, description, children) {
  return (
    <section className="document-settings-group">
      <div className="document-settings-group-heading">
        <h4>{title}</h4>
        {description && <p>{description}</p>}
      </div>
      <div className="document-settings-grid">{children}</div>
    </section>
  );
}

export function DocumentSettingsPanel({
  selectedSection,
  documentSettings,
  onUpdateDocumentSetting,
}) {
  const section = selectedSection;
  if (section === "Business Details") {
    return (
      <div className="document-settings-panel">
        <div className="document-settings-intro">
          <h3>Business Details</h3>
          <p>These details appear on receipts, invoices, payment confirmations, and client emails.</p>
        </div>
        {renderDocumentGroup("Business identity", "The name and brand shown at the top of every document.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "businessName", "Trading name")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "legalName", "Legal name", { hint: "Use if different from trading name." })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "ownerName", "Owner / therapist name")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "logoUrl", "Logo / brand mark URL", { hint: "Optional receipt header image." })}
          </>
        ))}
        {renderDocumentGroup("Contact and address", "Shown when clients need to contact you or keep a formal record.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "email", "Business email", { type: "email" })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "phone", "Business phone", { type: "tel" })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "website", "Website")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "addressLine1", "Address line 1")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "addressLine2", "Address line 2")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "city", "City")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "postcode", "Postcode")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "country", "Country")}
            {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showBusinessAddress", "Show business address on documents", "Useful for invoices and formal receipts.")}
          </>
        ))}
        {renderDocumentGroup("Tax and registration", "Optional business references for invoices, receipts, and your records.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "companyNumber", "Company number", { hint: "Optional." })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "utrNumber", "UTR / tax reference", { hint: "Optional, for your records." })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "vatNumber", "VAT number", { hint: "Only show if registered." })}
            {renderDocumentSelectField(documentSettings, onUpdateDocumentSetting, "currency", "Currency", [
              { value: "GBP", label: "GBP - Pound sterling" },
              { value: "EUR", label: "EUR - Euro" },
              { value: "USD", label: "USD - US dollar" },
            ])}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "taxLabel", "Tax label")}
            {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showVat", "Show VAT on receipts", "Turn on only if VAT registered.")}
          </>
        ))}
      </div>
    );
  }

  if (section === "Receipt Layout") {
    const receiptReference = `${documentSettings.receiptPrefix || "VDM"}-${documentSettings.nextReceiptNumber || "1001"}`;
    const businessAddress = [documentSettings.addressLine1, documentSettings.addressLine2, documentSettings.city, documentSettings.postcode, documentSettings.country]
      .filter(Boolean)
      .join(", ");
    return (
      <div className="document-settings-panel receipt-layout-editor">
        <div className="document-settings-intro">
          <h3>Receipt Layout</h3>
          <p>Edit the receipt in the same places the details will appear for clients.</p>
        </div>
        <section className="receipt-paper-preview" aria-label="Editable receipt preview">
          <header className="receipt-paper-header">
            <div className="receipt-logo-mark">
              {(documentSettings.businessName || "V").slice(0, 1).toUpperCase()}
            </div>
            <div className="receipt-header-fields">
              <label>
                <span>Business name</span>
                <input
                  value={documentSettings.businessName || ""}
                  onChange={(event) => onUpdateDocumentSetting("businessName", event.target.value)}
                />
              </label>
              <label>
                <span>Receipt email</span>
                <input
                  type="email"
                  value={documentSettings.email || ""}
                  onChange={(event) => onUpdateDocumentSetting("email", event.target.value)}
                  placeholder="Business email"
                />
              </label>
              <label>
                <span>Business phone</span>
                <input
                  type="tel"
                  value={documentSettings.phone || ""}
                  onChange={(event) => onUpdateDocumentSetting("phone", event.target.value)}
                  placeholder="Business phone"
                />
              </label>
            </div>
            <div className="receipt-reference-fields">
              <strong>Receipt</strong>
              <small>{receiptReference}</small>
              <div>
                <label>
                  <span>Prefix</span>
                  <input
                    value={documentSettings.receiptPrefix || ""}
                    onChange={(event) => onUpdateDocumentSetting("receiptPrefix", event.target.value)}
                  />
                </label>
                <label>
                  <span>Next number</span>
                  <input
                    type="number"
                    min="1"
                    value={documentSettings.nextReceiptNumber || ""}
                    onChange={(event) => onUpdateDocumentSetting("nextReceiptNumber", event.target.value)}
                  />
                </label>
              </div>
            </div>
          </header>

          {documentSettings.showBusinessAddress && (
            <label className="receipt-wide-field">
              <span>Business address shown on receipt</span>
              <input
                value={businessAddress}
                onChange={(event) => onUpdateDocumentSetting("addressLine1", event.target.value)}
                placeholder="Business address"
              />
            </label>
          )}

          <div className="receipt-client-strip">
            <div>
              <span>Receipt to</span>
              <strong>Mrs Amelia Hart</strong>
              {documentSettings.showClientAddress && <small>14 Oak Avenue, London</small>}
            </div>
            {documentSettings.showBookingReference && (
              <div>
                <label>
                  <span>Reference label</span>
                  <input
                    value={documentSettings.bookingReferenceLabel || ""}
                    onChange={(event) => onUpdateDocumentSetting("bookingReferenceLabel", event.target.value)}
                  />
                </label>
                <strong>VDM-2026-1487</strong>
              </div>
            )}
            <div>
              <span>Date paid</span>
              <strong>29 Jun 2026</strong>
              {documentSettings.showPaymentMethod && <small>Paid by card</small>}
            </div>
          </div>

          {documentSettings.showServiceBreakdown && (
            <div className="receipt-line-items">
              <div className="receipt-line-item receipt-line-heading">
                <span>Description</span>
                <span>Amount</span>
              </div>
              <div className="receipt-line-item">
                <span>Massage, 90m</span>
                <strong>£120</strong>
              </div>
              <div className="receipt-line-item">
                <span>Indian head massage add-on</span>
                <strong>£18</strong>
              </div>
              {documentSettings.showTravelCharges && (
                <div className="receipt-line-item">
                  <span>Travel / congestion charge</span>
                  <strong>£15</strong>
                </div>
              )}
            </div>
          )}

          <div className="receipt-totals">
            {documentSettings.showVat && (
              <div>
                <span>{documentSettings.taxLabel || "VAT"}</span>
                <strong>Included where applicable</strong>
              </div>
            )}
            <div className="receipt-total-row">
              <span>Total paid</span>
              <strong>£153</strong>
            </div>
          </div>

          <label className="receipt-wide-field">
            <span>Payment note</span>
            <textarea
              rows={2}
              value={documentSettings.paymentInstructions || ""}
              onChange={(event) => onUpdateDocumentSetting("paymentInstructions", event.target.value)}
            />
          </label>
          <label className="receipt-wide-field">
            <span>Receipt footer</span>
            <textarea
              rows={2}
              value={documentSettings.receiptFooter || ""}
              onChange={(event) => onUpdateDocumentSetting("receiptFooter", event.target.value)}
            />
          </label>
        </section>

        <section className="receipt-layout-options" aria-label="Receipt display options">
          {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showServiceBreakdown", "Service breakdown", "Show treatment, duration, add-ons, and totals.")}
          {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showTravelCharges", "Travel charges", "Show travel or congestion charges as their own line.")}
          {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showPaymentMethod", "Payment method", "Show how the receipt was paid.")}
          {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showBookingReference", "Booking reference", "Show the original booking reference on receipts.")}
          {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showClientAddress", "Client address", "Show the client address on receipts.")}
          {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "showBusinessAddress", "Business address", "Show your business address in the receipt header.")}
        </section>
      </div>
    );
  }

  if (section === "Invoice Settings") {
    return (
      <div className="document-settings-panel">
        <div className="document-settings-intro">
          <h3>Invoice Settings</h3>
          <p>Set invoice numbering, payment terms, and document-only bank details for pay-later clients.</p>
        </div>
        {renderDocumentGroup("Invoice numbering", "Separate invoice references from receipts.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "invoicePrefix", "Invoice prefix")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "nextInvoiceNumber", "Next invoice number", { type: "number" })}
            {renderDocumentSelectField(documentSettings, onUpdateDocumentSetting, "invoiceDueDays", "Payment due after", [
              { value: "0", label: "Same day" },
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" },
              { value: "30", label: "30 days" },
            ])}
          </>
        ))}
        {renderDocumentGroup("Document-only bank details", "Stored locally for invoice and receipt document settings. Live payment screens and booking emails use environment configuration.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "bankName", "Bank name")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "bankAccountName", "Account name")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "bankSortCode", "Sort code")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "bankAccountNumber", "Account number")}
          </>
        ))}
        {renderDocumentGroup("Invoice wording", "Payment terms and footer text for invoice PDFs or emails.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "paymentTerms", "Payment terms", { multiline: true })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "latePaymentText", "Late payment note", { multiline: true })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "invoiceFooter", "Invoice footer", { multiline: true })}
          </>
        ))}
      </div>
    );
  }

  if (section === "Email Receipt Template") {
    return (
      <div className="document-settings-panel">
        <div className="document-settings-intro">
          <h3>Email Receipt Template</h3>
          <p>Default wording for receipt emails. Booking details and totals can be inserted automatically later.</p>
        </div>
        {renderDocumentGroup("Sending rules", "Controls when receipts are sent after a booking is paid or completed.", (
          <>
            {renderDocumentToggle(documentSettings, onUpdateDocumentSetting, "sendReceiptAutomatically", "Send receipt automatically", "Send after a booking is marked paid.")}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "emailReplyTo", "Reply-to email", { type: "email", hint: "Optional, defaults to business email." })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "emailCc", "CC email", { type: "email", hint: "Optional internal copy." })}
          </>
        ))}
        {renderDocumentGroup("Email wording", "The client-facing receipt email text.", (
          <>
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "emailSubject", "Email subject", { hint: "Example: Your VadMassage receipt" })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "emailIntro", "Email opening text", { multiline: true })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "emailSignature", "Signature", { multiline: true })}
          </>
        ))}
      </div>
    );
  }

  if (section === "Cancellation Text") {
    return (
      <div className="document-settings-panel">
        <div className="document-settings-intro">
          <h3>Cancellation Text</h3>
          <p>This wording can appear on receipts, confirmation emails, and client booking screens.</p>
        </div>
        {renderDocumentGroup("Cancellation rules", "The policy clients see before and after booking.", (
          <>
            {renderDocumentSelectField(documentSettings, onUpdateDocumentSetting, "cancellationNoticeHours", "Free cancellation window", [
              { value: "12", label: "12 hours before" },
              { value: "24", label: "24 hours before" },
              { value: "48", label: "48 hours before" },
              { value: "72", label: "72 hours before" },
            ])}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "cancellationText", "Cancellation policy", { multiline: true })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "cancellationFeeText", "Late cancellation fee wording", { multiline: true })}
            {renderDocumentTextField(documentSettings, onUpdateDocumentSetting, "noShowText", "No-show wording", { multiline: true })}
          </>
        ))}
      </div>
    );
  }

  return null;
}
