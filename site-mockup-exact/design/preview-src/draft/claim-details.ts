// Claim questions and the preview fields derived from their answers.
import type { MessageKey } from "@/lib/i18n/dictionary";

export type ClaimTypeId = "delayed" | "cancelled" | "denied_boarding" | "baggage" | "reimbursement";

export const CLAIM_TYPE_IDS: readonly ClaimTypeId[] = ["delayed", "cancelled", "denied_boarding", "baggage", "reimbursement"];

export interface ClaimQuestionOption {
  value: string;
  labelKey: MessageKey;
}

export interface ClaimQuestion {
  key: string;
  labelKey: MessageKey;
  options: readonly ClaimQuestionOption[];
  /** Asked only when this returns true (defaults to always). */
  when?: (answers: ClaimAnswers) => boolean;
  /** Shown but not answerable when true; counts as answered. */
  disabledWhen?: (answers: ClaimAnswers) => boolean;
}

/** Causes a reimbursement claim can stem from. A reimbursement is its own case, never linked to a compensation claim. */
export const REIMBURSEMENT_CAUSES = ["baggage_delay", "baggage_loss", "baggage_damage", "flight_delay", "flight_cancel", "denied_boarding"] as const;
export type ReimbursementCause = (typeof REIMBURSEMENT_CAUSES)[number];

export function isBaggageCause(cause: string | undefined): boolean {
  return cause === "baggage_delay" || cause === "baggage_loss" || cause === "baggage_damage";
}

export const DELAY_WINDOWS = [
  { value: "threeToFive", labelKey: "claimDetails.o.reimbDelayLow" },
  { value: "fiveToEight", labelKey: "claimDetails.o.reimbDelayMid" },
  { value: "overEight", labelKey: "claimDetails.o.reimbDelayOver8" },
] as const satisfies readonly ClaimQuestionOption[];

/** What each kind of claim asks about, in the order it is asked. */
export const CLAIM_QUESTIONS: Record<ClaimTypeId, readonly ClaimQuestion[]> = {
  delayed: [
    {
      key: "delayBucket",
      labelKey: "claimDetails.q.delay",
      options: DELAY_WINDOWS,
    },
  ],
  cancelled: [
    {
      key: "noticeBucket",
      labelKey: "claimDetails.q.notice",
      options: [
        { value: "late", labelKey: "claimDetails.o.noticeLate" },
        { value: "medium", labelKey: "claimDetails.o.noticeMedium" },
        { value: "early", labelKey: "claimDetails.o.noticeEarly" },
      ],
    },
    {
      key: "alternativeOffered",
      labelKey: "claimDetails.q.alternative",
      options: [
        { value: "yes", labelKey: "claimDetails.o.yes" },
        { value: "no", labelKey: "claimDetails.o.no" },
      ],
    },
  ],
  denied_boarding: [
    {
      key: "deniedReason",
      labelKey: "claimDetails.q.denied",
      options: [
        { value: "overbooking", labelKey: "claimDetails.o.overbooking" },
        { value: "voluntary", labelKey: "claimDetails.o.voluntary" },
      ],
    },
  ],
  baggage: [
    {
      key: "baggageStatus",
      labelKey: "claimDetails.q.baggage",
      options: [
        { value: "lost", labelKey: "claimDetails.o.bagLost" },
        { value: "delayed", labelKey: "claimDetails.o.bagDelayed" },
        { value: "damaged", labelKey: "claimDetails.o.bagDamaged" },
      ],
    },
    {
      key: "baggageDays",
      labelKey: "claimDetails.q.baggageDays",
      when: (answers) => Boolean(answers.baggageStatus) && answers.baggageStatus !== "lost",
      options: [
        { value: "short", labelKey: "claimDetails.o.bagShort" },
        { value: "medium", labelKey: "claimDetails.o.bagMedium" },
        { value: "long", labelKey: "claimDetails.o.bagLong" },
      ],
    },
  ],
  reimbursement: [
    {
      key: "expenseCause",
      labelKey: "claimDetails.q.expenseCause",
      options: [
        { value: "baggage_delay", labelKey: "claimDetails.o.causeBagDelay" },
        { value: "baggage_loss", labelKey: "claimDetails.o.causeBagLoss" },
        { value: "baggage_damage", labelKey: "claimDetails.o.causeBagDamage" },
        { value: "flight_delay", labelKey: "claimDetails.o.causeFlightDelay" },
        { value: "flight_cancel", labelKey: "claimDetails.o.causeFlightCancel" },
        { value: "denied_boarding", labelKey: "claimDetails.o.causeDenied" },
      ],
    },
    {
      key: "reimbDelayWindow",
      labelKey: "claimDetails.q.delay",
      when: (a) => a.expenseCause === "flight_delay",
      options: DELAY_WINDOWS,
    },
    {
      key: "bagRecovered",
      labelKey: "claimDetails.q.bagRecovered",
      when: (a) => a.expenseCause === "baggage_loss",
      options: [
        { value: "yes", labelKey: "claimDetails.o.yes" },
        { value: "never", labelKey: "claimDetails.o.bagNeverRecovered" },
      ],
    },
    {
      key: "baggageDays",
      labelKey: "claimDetails.q.baggageDays",
      when: (a) => a.expenseCause === "baggage_delay" ||
        (a.expenseCause === "baggage_loss" && a.bagRecovered === "yes"),
      options: [
        { value: "short", labelKey: "claimDetails.o.bagShort" },
        { value: "medium", labelKey: "claimDetails.o.bagMedium" },
        { value: "long", labelKey: "claimDetails.o.bagLong" },
      ],
    },
  ],
};

export type ClaimAnswers = Record<string, string>;

/** The questions that apply right now (a question with a `when` appears only once its condition holds). */
export function activeQuestions(type: ClaimTypeId, answers: ClaimAnswers): readonly ClaimQuestion[] {
  return CLAIM_QUESTIONS[type].filter((question) => !question.when || question.when(answers));
}

/** Days of notice each answer stands for (EU261: 14 or more days means no compensation is owed). */
const NOTICE_DAYS: Record<string, string> = { late: "3", medium: "10", early: "14" };

export function isClaimTypeId(value: string): value is ClaimTypeId {
  return (CLAIM_TYPE_IDS as readonly string[]).includes(value);
}

export function allQuestionsAnswered(type: ClaimTypeId, answers: ClaimAnswers): boolean {
  return activeQuestions(type, answers).every(question =>
    question.disabledWhen?.(answers) || question.options.some(option => option.value === answers[question.key]));
}

export interface ClaimDetailsFields {
  disruptionType: ClaimTypeId;
  delayBucket: string;
  baggageStatus: string;
  cancellationNoticeDays: string;
  /** Plain-language record of the answers, so the team sees what the customer said. */
  notes: string;
}

/**
 * `label` renders a message key; the team reads the notes, so callers pass the Hebrew translator
 * regardless of the customer's own language.
 */
export function buildClaimDetailsFields(
  type: ClaimTypeId,
  answers: ClaimAnswers,
  label: (key: MessageKey) => string,
): ClaimDetailsFields {
  const lines: string[] = [];
  for (const question of activeQuestions(type, answers)) {
    if (question.disabledWhen?.(answers)) continue;
    const picked = question.options.find((option) => option.value === answers[question.key]);
    if (picked) lines.push(`${label(question.labelKey)} ${label(picked.labelKey)}`);
  }
  return {
    disruptionType: type,
    delayBucket: type === "delayed" ? answers.delayBucket ?? "" : "",
    baggageStatus: type === "baggage" ? answers.baggageStatus ?? "" : "",
    cancellationNoticeDays: type === "cancelled" ? (NOTICE_DAYS[answers.noticeBucket ?? ""] ?? "") : "",
    notes: lines.join("\n"),
  };
}

/** `+972` and `050-1234567` become `+972501234567`; a number already written with its prefix is left alone. */
export function composePhone(dialCode: string, localNumber: string): string {
  const trimmed = localNumber.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[\s\-()]/g, "").replace(/^0+/, "");
  return `${dialCode}${digits}`;
}

export const DIAL_CODES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "+972", label: "ישראל" },
  { value: "+1", label: "ארה״ב / קנדה" },
  { value: "+44", label: "בריטניה" },
  { value: "+49", label: "גרמניה" },
  { value: "+33", label: "צרפת" },
  { value: "+34", label: "ספרד" },
  { value: "+39", label: "איטליה" },
  { value: "+31", label: "הולנד" },
  { value: "+41", label: "שווייץ" },
  { value: "+43", label: "אוסטריה" },
  { value: "+32", label: "בלגיה" },
  { value: "+351", label: "פורטוגל" },
  { value: "+30", label: "יוון" },
  { value: "+90", label: "טורקיה" },
  { value: "+357", label: "קפריסין" },
  { value: "+48", label: "פולין" },
  { value: "+420", label: "צ׳כיה" },
  { value: "+36", label: "הונגריה" },
  { value: "+40", label: "רומניה" },
  { value: "+7", label: "רוסיה" },
  { value: "+380", label: "אוקראינה" },
  { value: "+971", label: "איחוד האמירויות" },
  { value: "+974", label: "קטאר" },
  { value: "+20", label: "מצרים" },
  { value: "+962", label: "ירדן" },
];
