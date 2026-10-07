export const CONTACT_STATUSES = ["new", "reviewing", "replied", "closed", "spam"] as const;
export const CONTACT_STAGES = ["inbox", "qualified", "contacted", "proposal", "won", "lost"] as const;
export const CONTACT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const CONTACT_FOLLOW_UP_FILTERS = ["due", "scheduled", "none"] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export type ContactStage = (typeof CONTACT_STAGES)[number];
export type ContactPriority = (typeof CONTACT_PRIORITIES)[number];
export type ContactFollowUpFilter = (typeof CONTACT_FOLLOW_UP_FILTERS)[number];
export type ContactLocale = "vi" | "en" | "ja" | "zh";

export type ContactListInput = {
  limit: number;
  cursor: { updatedAt: string; id: string } | null;
  query: string | null;
  status: ContactStatus | null;
  stage: ContactStage | null;
  priority: ContactPriority | null;
  assignee: string | null;
  tag: string | null;
  followUp: ContactFollowUpFilter | null;
  locale: ContactLocale | null;
  createdFrom: string | null;
  createdTo: string | null;
};

export type ContactUpdateInput = {
  expectedUpdatedAt: string;
  status?: ContactStatus;
  stage?: ContactStage;
  priority?: ContactPriority;
  assignee?: string | null;
  followUpAt?: string | null;
  followUpNote?: string | null;
  tags?: string[];
};

export type ContactListItem = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  projectWebsite: string | null;
  messagePreview: string;
  locale: string;
  status: string;
  stage: string;
  priority: string;
  assignee: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ContactNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactActivity = {
  id: string;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type ContactDetail = ContactListItem & {
  message: string;
  userAgent: string | null;
  notes: ContactNote[];
  activities: ContactActivity[];
};
