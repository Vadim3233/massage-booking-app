export const PERSONAL_EVENT_COLORS = [
  { id: "orange", label: "Orange" },
  { id: "red", label: "Red" },
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
];
export const DEFAULT_PERSONAL_EVENT_COLOR = "orange";

export function personalEventColorClass(color) {
  const safeColor = PERSONAL_EVENT_COLORS.some((item) => item.id === color) ? color : DEFAULT_PERSONAL_EVENT_COLOR;
  return `personal-event-color-${safeColor}`;
}
