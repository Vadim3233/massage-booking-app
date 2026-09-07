export function serviceAbbreviation(name) {
  const known = {
    "Assisted Stretching": "AS",
    "Body Exam": "BE",
    "Cloud Nine Head Massage": "CNH",
    "Deep Tissue Recovery": "DTR",
    Massage: "M",
    "Personal event": "PE",
    "Performance Sports Massage": "PSM",
    "Prenatal Wellness": "PW",
    "Soft Tissue Therapy": "STT",
    "The Zero-Gravity Melt": "ZGM",
  };

  if (known[name]) return known[name];

  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function customerInitials(name) {
  const parts = String(name || "Guest").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function customerTotalSpent(customer) {
  return (customer?.appointments || []).reduce((total, appointment) => total + (Number(appointment.total) || 0), 0);
}

export function customerPreferredService(customer) {
  const counts = new Map();
  (customer?.appointments || []).forEach((appointment) => {
    const serviceName = appointment.serviceName || "Treatment";
    counts.set(serviceName, (counts.get(serviceName) || 0) + 1);
  });
  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || "Not enough history";
}

export function customerPreferredServiceShort(customer) {
  const preferredService = customerPreferredService(customer);
  return preferredService === "Not enough history" ? "N/A" : serviceAbbreviation(preferredService);
}
