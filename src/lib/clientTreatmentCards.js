import {
  Activity,
  Baby,
  Bone,
  Flame,
  HandHeart,
  HeartPulse,
  Leaf,
  StretchHorizontal,
  UserRound,
  Waves,
} from "lucide-react";

export const CLIENT_TREATMENT_CARD_DETAILS = {
  massage: {
    description: "Bespoke mobile massage adapted to what your body needs.",
    icon: HandHeart,
    title: "Massage",
  },
  "assisted-stretching": {
    description: "Guided stretching to improve mobility and ease restriction.",
    icon: StretchHorizontal,
    title: "Assisted Stretching",
  },
  "soft-tissue-therapy": {
    description: "Targeted soft tissue work for recovery, tension, and movement.",
    icon: HeartPulse,
    title: "Soft Tissue Therapy",
  },
  "body-exam": {
    description: "A focused body assessment before planning your next session.",
    icon: Activity,
    title: "Body Exam",
  },
};

export function getServiceIconFromText(service) {
  const text = [
    service?.name,
    service?.shortDescription,
    service?.longDescription,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(prenatal|pregnancy|pregnant|maternity)\b/.test(text)) return Baby;
  if (/\b(stretch|stretching|mobility|flexibility)\b/.test(text)) return StretchHorizontal;
  if (/\b(soft tissue|therapy|therapeutic|assessment|injur|rehab|recovery)\b/.test(text)) return HeartPulse;
  if (/\b(head|neck|shoulder|scalp)\b/.test(text)) return UserRound;
  if (/\b(hot stone|stone|heat|warm)\b/.test(text)) return Flame;
  if (/\b(sport|performance|athletic|muscle)\b/.test(text)) return Activity;
  if (/\b(relax|calm|zero-gravity|zero gravity|wellness|restorative|stress)\b/.test(text)) return Waves;
  if (/\b(deep|tension|pain|postural)\b/.test(text)) return Bone;
  if (/\b(massage|bodywork|treatment)\b/.test(text)) return HandHeart;
  return null;
}

export function getClientTreatmentCardDetails(service) {
  const preset = CLIENT_TREATMENT_CARD_DETAILS[service.id] ?? {};
  const inferredIcon = getServiceIconFromText(service);
  return {
    description: service.shortDescription || preset.description || "A tailored mobile massage treatment.",
    icon: inferredIcon || preset.icon || Leaf,
    title: service.name || preset.title || "Massage treatment",
  };
}
