export type ActionType = 'email' | 'meeting' | 'task';
export type ActionStatus =
  | 'needs_clarification'
  | 'pending_approval'
  | 'approved'
  | 'queued'
  | 'simulated'
  | 'undone'
  | 'cancelled'
  | 'escalated';
export type Severity = 'blocking' | 'confirm' | 'info';
export type Timezone = 'WIB' | 'WITA' | 'WIT';
export type ContactKind = 'internal' | 'external';

export interface Contact {
  id: string;
  name: string;
  email: string;
  role?: string;
  city?: string;
  timezone?: Timezone | null;
  /** Explicit kind from the data; otherwise derived from the organisation's email domains. */
  kind?: ContactKind | null;
  aliases?: string[];
  members?: string[];
}

export interface ContactRef {
  id: string;
  name: string;
  email: string;
  role?: string;
  city?: string;
  timezone?: Timezone | null;
  kind: ContactKind;
  members?: number;
}

export interface Holiday { date: string; name: string; source: string }

export interface Rules {
  officeHours: { start: string; end: string; weekdays: number[]; source: string };
  fridayPrayer: { start: string; end: string; source: string };
  meetingDefaultMinutes: number;
  maxClarificationRounds: number;
  undoWindowSeconds: number;
  /** true while the organisation has not supplied its own rules. */
  isDefault: boolean;
  source: string;
}

export interface Dataset {
  meta: {
    /** empty = nothing supplied yet; imported = from a file; manual = typed into Berezz. */
    origin: 'empty' | 'imported' | 'manual';
    fileName?: string | null;
    importedAt?: string | null;
    importedBy?: string | null;
  };
  timezones: Record<Timezone, { label: Timezone; city: string; offsetMinutes: number }>;
  contacts: Contact[];
  rules: Rules;
  /** null = the organisation has not supplied a holiday calendar. */
  holidays: Holiday[] | null;
}

export interface Settings {
  orgName: string;
  /** Email domains that count as internal, e.g. ["perusahaan.co.id"]. */
  orgDomains: string[];
  operatorName: string;
  operatorRole: string;
  defaultTimezone: Timezone;
  refDate: { mode: 'system' | 'fixed'; fixed: string | null };
  /** rules = deterministic parser; model = OpenAI-compatible model proposes, Berezz grounds. */
  planner: 'rules' | 'model';
}

export interface AmbiguousRecipient { alias: string; contacts: ContactRef[] }

export interface SourceRef {
  quote: string;
  start: number;
  end: number;
  documentId: string | null;
}

export interface ActionFields {
  to?: ContactRef[];
  cc?: ContactRef[];
  subject?: string;
  body?: string;
  date?: string | null;
  start?: string | null;
  end?: string | null;
  timezone?: Timezone | null;
  participants?: ContactRef[];
  location?: string | null;
  title?: string;
  owner?: ContactRef | null;
  due?: string | null;
  language?: 'id' | 'en';
  draftFrom?: string | null;
  contentConfirmed?: boolean;
  datePhrase?: string | null;
  dateConfidence?: 'explicit' | 'derived' | 'ambiguous' | 'confirmed' | null;
  dateWeekday?: number | null;
  duePhrase?: string | null;
  dueConfidence?: 'explicit' | 'derived' | 'ambiguous' | 'confirmed' | null;
  timePhrase?: string | null;
  timeAssumed?: boolean;
  timeConfirmed?: boolean;
  conversions?: Array<{ from: { tz: Timezone; time: string }; to: { tz: Timezone; time: string } }>;
  resolvedFrom?: string;
  autoAdjusted?: boolean;
  sourceDocumentId?: string | null;
  [key: string]: unknown;
}

export interface JobCounts {
  total: number;
  answer: number;
  approve: number;
  queued: number;
  done: number;
  undone: number;
  cancelled: number;
  escalated: number;
}

export interface JobSummary {
  id: string;
  title: string;
  requester: string;
  channel: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  group: 'mine' | 'running' | 'done';
  counts: JobCounts;
  injections: number;
}

export interface FullJob extends JobSummary {
  session: Session;
  summary: Record<string, unknown>;
  acks: Record<string, Array<{ code: string; label: string }>>;
}

export type SlotViolation =
  | { code: 'HOLIDAY_CONFLICT'; zone: Timezone; holiday: Holiday }
  | { code: 'NOT_A_WORKDAY'; zone: Timezone }
  | { code: 'OUTSIDE_OFFICE_HOURS' | 'FRIDAY_PRAYER_CONFLICT'; zone: Timezone; start: number; end: number };

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  source?: string;
  sourceId?: string;
  quote?: string;
  line?: number;
  labels?: string[];
  patterns?: string[];
  question?: string;
  candidates?: ContactRef[];
  mention?: string;
  options?: Timezone[];
  proposal?: { date: string; start: string; end: string; timezone: Timezone; reason: string } | null;
  conflict?: { chat: string; doc: string; docId: string; docName: string; quote: string };
  ackLabel?: string;
  offset?: number;
  /** Same slot in a participant's local zone, e.g. "17.30–18.30 WIT bagi Andi". */
  localNote?: string | null;
}

export interface ClarificationOption { value: string; label: string; detail?: string; tag?: string }

export interface ClarificationQuestion {
  id: string;
  kind: string;
  finding: string;
  text: string;
  hint?: string;
  mention?: string;
  options: ClarificationOption[];
  /** Answer may be a contact the person adds on the spot. */
  allowNewContact?: boolean;
  /** Free-form answer field shown next to the options. */
  input?: 'text' | 'line' | 'date' | 'time';
}

export interface SimulatedResult {
  simulated: true;
  ref: string;
  adapter: string;
  queuedAt: string;
  undoUntil: string;
  deliveredAt: string | null;
  undoneAt: string | null;
  fingerprint: string;
  version: number;
  payload: ActionFields;
  note: string;
}

export interface Action {
  id: string;
  type: ActionType;
  status: ActionStatus;
  version: number;
  rounds: number;
  fields: ActionFields;
  source: SourceRef;
  findings: Finding[];
  questions: ClarificationQuestion[];
  history: Array<Record<string, unknown>>;
  approvedFingerprint: string | null;
  approvedAt: string | null;
  approvedBy?: string | null;
  fingerprint?: string;
  result: SimulatedResult | null;
  acks?: Record<string, boolean>;
  ambiguousRecipients?: AmbiguousRecipient[] | null;
  unknownMentions?: string[] | null;
  /** Contacts the person picked or added; they need no quote in the source. */
  confirmedContactIds?: string[];
  plannedBy?: 'rules' | 'model';
  /** Findings attached from outside the validator (reviewer, model grounding). */
  extraFindings?: Finding[];
  roundsByKind?: Record<string, number>;
}

export interface AuditEntry {
  seq: number;
  at: string;
  type: string;
  actor: string;
  detail: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Tool calls in this build are always simulated; data may be the organisation's own. */
  toolMode: 'simulasi';
}

export interface ReviewFinding {
  code: 'MISSING_ACTION' | 'ADDED_ACTION' | 'RECIPIENT_NOT_IN_SOURCE' | 'ACTION_FROM_EMBEDDED_TEXT' | 'TYPE_MISMATCH';
  severity: Severity;
  actionId?: string;
  quote?: string;
  message: string;
}

export interface ReviewReport {
  at: string;
  reviewer: string;
  checked: number;
  matched: number;
  missing: number;
  added: number;
  findings: ReviewFinding[];
}

export interface Attachment { id?: string; name: string; text: string }

export interface Session {
  dataset: Dataset;
  settings: Settings;
  systemDate: string;
  rawInput: string;
  attachments: Attachment[];
  actions: Action[];
  findingsGlobal: Finding[];
  audit: AuditEntry[];
  planVersion: number;
  review: ReviewReport | null;
  planner: { mode: 'rules' | 'model'; name: string; note?: string | null };
  clock: () => string;
  metrics: {
    actionsPlanned: number;
    blocked: number;
    questionsAsked: number;
    simulated: number;
    pipelineMs: number;
  };
}

/** A plan proposed by a model (e.g. a WorkBuddy agent). Only drafting text is trusted from it. */
export interface ProposedAction {
  type: ActionType;
  source_quote: string;
  title?: string;
  subject?: string;
  body?: string;
  recipients?: string[];
}
