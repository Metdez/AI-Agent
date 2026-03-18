// =============================================================================
// Core types for the Lead Gen app
// These mirror what jam-nodes returns but are decoupled for our storage layer
// =============================================================================

export interface Lead {
  id: string;
  // Source data from LinkedIn Monitor node
  platform: "linkedin";
  postUrl: string;
  postText: string;
  authorName: string;
  authorHandle: string;
  authorUrl: string;
  authorHeadline?: string;
  authorFollowers: number;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  postedAt: string;

  // AI analysis from Social AI Analyze node
  relevanceScore: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  isComplaint: boolean;
  urgencyLevel: "low" | "medium" | "high";
  aiSummary: string;
  matchedKeywords: string[];

  // App-level metadata
  status: "new" | "reviewing" | "contacted" | "dismissed";
  scannedAt: string;
}

export interface Draft {
  id: string;
  leadId: string;
  toName: string;
  toEmail: string;
  toCompany: string;
  toTitle: string;
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent" | "rejected";
  createdAt: string;
}

export interface AppSettings {
  // LinkedIn monitoring
  keywords: string[];
  maxResults: number;

  // AI analysis
  topic: string;
  userIntent: string;

  // Email drafting
  productDescription: string;
  senderName: string;
  emailTemplate?: string;

  // API keys
  anthropicApiKey: string;
  forumScoutApiKey: string;
}

export interface ScanResult {
  leadsFound: number;
  draftsGenerated: number;
  timestamp: string;
  errors: string[];
}
