export const CLIENT_BOOKING_HISTORY_STEPS = [
  "location", "treatment", "duration", "time", "review", "details", "payment", "my-bookings",
];

const HISTORY_KEY = "__vadBookingFlow";

function stepUrl(location, step) {
  const params = new URLSearchParams(location.search || "");
  params.set("clientStep", step);
  const query = params.toString();
  return `${location.pathname || "/"}${query ? `?${query}` : ""}${location.hash || ""}`;
}

export function createBookingStepHistory({ history, location, onExitAttempt, onStep, steps = CLIENT_BOOKING_HISTORY_STEPS }) {
  const allowed = new Set(steps);
  const flowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const entries = new Map();
  let currentIndex = 0;
  let currentStep = "location";
  let initialized = false;

  function stateFor(step, index) {
    return { ...(history.state || {}), [HISTORY_KEY]: { flowId, index, step } };
  }

  function initialize(step) {
    if (initialized) return;
    currentStep = allowed.has(step) ? step : "location";
    entries.set(0, currentStep);
    history.replaceState({ ...(history.state || {}), [HISTORY_KEY]: { boundary: true, flowId } }, "", stepUrl(location, currentStep));
    history.pushState(stateFor(currentStep, 0), "", stepUrl(location, currentStep));
    initialized = true;
  }

  function navigate(step, { replace = false } = {}) {
    if (!allowed.has(step)) return false;
    if (!initialized) initialize(currentStep);
    if (step === currentStep) return false;
    if (!replace && currentIndex > 0 && entries.get(currentIndex - 1) === step) {
      history.back();
      return true;
    }
    if (!replace && entries.get(currentIndex + 1) === step) {
      history.forward();
      return true;
    }
    if (replace) {
      currentStep = step;
      entries.set(currentIndex, step);
      history.replaceState(stateFor(step, currentIndex), "", stepUrl(location, step));
      onStep(step);
      return true;
    }
    currentIndex += 1;
    for (const index of [...entries.keys()]) if (index > currentIndex) entries.delete(index);
    currentStep = step;
    entries.set(currentIndex, step);
    history.pushState(stateFor(step, currentIndex), "", stepUrl(location, step));
    onStep(step);
    return true;
  }

  function handlePopState(event) {
    const entry = event?.state?.[HISTORY_KEY];
    if (!entry || entry.flowId !== flowId) return false;
    if (entry.boundary) {
      const leave = () => history.back();
      const stay = () => history.forward();
      if (onExitAttempt) onExitAttempt({ leave, stay });
      else leave();
      return true;
    }
    if (!allowed.has(entry.step)) return false;
    currentIndex = entry.index;
    currentStep = entry.step;
    entries.set(currentIndex, currentStep);
    onStep(currentStep);
    return true;
  }

  return { handlePopState, initialize, navigate };
}

export function hasMeaningfulBookingProgress({
  addressDetails,
  clientServiceId,
  clientSelectedSlot,
  confirmedAppointments,
  contactDetails,
  durationQuantitiesByService,
  paymentSelected,
  selectedAreaId,
  selectedEnhancements,
  selectedSessionPreferenceIds,
  serviceDurations,
}) {
  if (Array.isArray(confirmedAppointments) && confirmedAppointments.length > 0) return false;
  const hasText = (values) => values.some((value) => String(value || "").trim());
  return Boolean(
    selectedAreaId || clientServiceId || clientSelectedSlot || paymentSelected ||
    Object.values(serviceDurations || {}).some((value) => Number(value) > 0) ||
    Object.values(durationQuantitiesByService || {}).some((quantities) =>
      Object.values(quantities || {}).some((value) => Number(value) > 0)
    ) ||
    (selectedEnhancements || []).length || (selectedSessionPreferenceIds || []).length ||
    hasText([
      contactDetails?.address,
      contactDetails?.email,
      contactDetails?.firstName,
      contactDetails?.lastName,
      contactDetails?.notes,
      contactDetails?.phone,
      addressDetails?.additionalNotes,
      addressDetails?.apartment,
      addressDetails?.entryInstructions,
      addressDetails?.postcode,
      addressDetails?.streetAddress,
    ])
  );
}

export function createBeforeUnloadProtection(target) {
  let active = false;
  const handler = (event) => {
    event.preventDefault();
    event.returnValue = "";
  };
  return {
    sync(shouldProtect) {
      if (Boolean(shouldProtect) === active) return;
      active = Boolean(shouldProtect);
      if (active) target.addEventListener("beforeunload", handler);
      else target.removeEventListener("beforeunload", handler);
    },
    dispose() {
      if (active) target.removeEventListener("beforeunload", handler);
      active = false;
    },
  };
}
