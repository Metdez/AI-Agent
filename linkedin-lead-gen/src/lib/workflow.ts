// =============================================================================
// Lead Gen Workflow Pipeline
//
// This mirrors the jam-nodes pattern:
//   Step 1: LinkedIn Monitor (ForumScout API) → raw posts
//   Step 2: AI Analyze (Claude API) → scored + categorized leads
//   Step 3: Draft Emails (Claude API) → personalized outreach drafts
//
// Each step is modeled after the corresponding jam-nodes node but embedded
// directly so the app is self-contained. When you're ready to scale, you can
// swap these for the actual @jam-nodes/nodes package and use executeWorkflow().
// =============================================================================

import type { Lead, Draft, AppSettings, ScanResult } from "./types";

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const FORUMSCOUT_BASE_URL = "https://forumscout.app/api";

// =============================================================================
// Helper: Claude API call
// =============================================================================

async function callClaude(
  apiKey: string,
  prompt: string,
  maxTokens = 4000
): Promise<string> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// =============================================================================
// Step 1: LinkedIn Monitor (mirrors linkedinMonitorNode)
// =============================================================================

interface RawLinkedInPost {
  id: string;
  platform: "linkedin";
  url: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorUrl: string;
  authorFollowers: number;
  authorHeadline?: string;
  engagement: { likes: number; comments: number; shares: number };
  hashtags: string[];
  postedAt: string;
}

async function monitorLinkedIn(
  forumScoutKey: string,
  keywords: string[],
  maxResults: number
): Promise<RawLinkedInPost[]> {
  const searchKeyword = keywords.join(" ");
  const url = new URL(`${FORUMSCOUT_BASE_URL}/linkedin_search`);
  url.searchParams.set("keyword", searchKeyword);
  url.searchParams.set("sort_by", "date_posted");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-API-Key": forumScoutKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ForumScout API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = Array.isArray(data)
    ? data
    : data.posts || data.results || data.data || [];

  return raw.slice(0, maxResults).map(
    (
      post: Record<string, unknown>,
      index: number
    ): RawLinkedInPost => ({
      id:
        (post.id as string) ||
        (post.urn as string) ||
        `linkedin-${index}-${Date.now()}`,
      platform: "linkedin",
      url: (post.url as string) || "",
      text:
        (post.text as string) ||
        (post.content as string) ||
        (post.snippet as string) ||
        "",
      authorName:
        (post.authorName as string) || (post.author as string) || "Unknown",
      authorHandle: extractHandle(
        (post.authorUrl as string) || (post.authorProfileUrl as string) || ""
      ),
      authorUrl:
        (post.authorUrl as string) ||
        (post.authorProfileUrl as string) ||
        "",
      authorFollowers: (post.authorFollowers as number) || 0,
      authorHeadline: post.authorHeadline as string | undefined,
      engagement: {
        likes:
          (post.likes as number) ||
          (post.numLikes as number) ||
          (post.reactions as number) ||
          0,
        comments: (post.comments as number) || (post.numComments as number) || 0,
        shares: (post.shares as number) || (post.numShares as number) || 0,
      },
      hashtags:
        (post.hashtags as string[]) ||
        extractHashtags(
          (post.text as string) || (post.content as string) || ""
        ),
      postedAt:
        (post.postedAt as string) ||
        (post.datePosted as string) ||
        (post.date as string) ||
        new Date().toISOString(),
    })
  );
}

function extractHandle(url: string): string {
  if (!url) return "unknown";
  const parts = url.split("/");
  const inIdx = parts.indexOf("in");
  if (inIdx !== -1 && parts[inIdx + 1])
    return parts[inIdx + 1].split("?")[0] || "unknown";
  return parts[parts.length - 1]?.split("?")[0] || "unknown";
}

function extractHashtags(text: string): string[] {
  return (text.match(/#\w+/g) || []).map((t) => t.slice(1));
}

// =============================================================================
// Step 2: AI Analyze (mirrors socialAiAnalyzeNode)
// =============================================================================

interface AnalysisResult {
  id: string;
  relevanceScore: number;
  sentiment: string;
  isComplaint: boolean;
  urgencyLevel: string;
  aiSummary: string;
  matchedKeywords: string[];
}

async function analyzePostsWithAI(
  anthropicKey: string,
  posts: RawLinkedInPost[],
  topic: string,
  userIntent: string
): Promise<AnalysisResult[]> {
  if (posts.length === 0) return [];

  const BATCH_SIZE = 10;
  const allResults: AnalysisResult[] = [];

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    const prompt = `You are analyzing LinkedIn posts for lead generation.

Topic/Product: ${topic}
Intent: ${userIntent}

Analyze each post and return a JSON array. For each post, provide:
- id (string): the post ID
- relevanceScore (0-100): how relevant this post is to the topic
- sentiment: "positive", "negative", "neutral", or "mixed"
- isComplaint (boolean): is the person complaining about a problem you can solve?
- urgencyLevel: "low", "medium", or "high"
- aiSummary (string): 1-2 sentence summary of why this is relevant
- matchedKeywords (string[]): keywords from the post that match the topic

Posts to analyze:
${batch
  .map(
    (p) => `
[Post ID: ${p.id}]
Author: ${p.authorName} (${p.authorHeadline || "no headline"})
Followers: ${p.authorFollowers}
Text: ${p.text.slice(0, 500)}
Engagement: ${p.engagement.likes} likes, ${p.engagement.comments} comments
`
  )
  .join("\n---\n")}

Return ONLY a JSON array, no other text:`;

    try {
      const response = await callClaude(anthropicKey, prompt, 4000);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed: AnalysisResult[] = JSON.parse(jsonMatch[0]);
        allResults.push(
          ...parsed.filter((r) => r.relevanceScore >= 30)
        );
      }
    } catch {
      // Continue with next batch
    }
  }

  return allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// =============================================================================
// Step 3: Draft Outreach (mirrors draftEmailsNode)
// =============================================================================

async function draftOutreach(
  anthropicKey: string,
  lead: Lead,
  settings: AppSettings
): Promise<{ subject: string; body: string }> {
  const prompt = `You are drafting a personalized LinkedIn outreach message.

About the sender:
- Name: ${settings.senderName}
- Product: ${settings.productDescription}

About the recipient:
- Name: ${lead.authorName}
- Headline: ${lead.authorHeadline || "N/A"}
- Their post (summary): ${lead.aiSummary}
- Their sentiment: ${lead.sentiment}
- Is complaint: ${lead.isComplaint}

Write a short, personalized outreach message (3-5 sentences) that:
1. References something specific from their post
2. Shows empathy for their situation
3. Briefly mentions how the product could help
4. Ends with a soft call to action (no hard sell)

Also provide a subject line.

Return as JSON: { "subject": "...", "body": "..." }`;

  const response = await callClaude(anthropicKey, prompt, 500);
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { subject: "Quick note", body: response };

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { subject: "Quick note", body: response };
  }
}

// =============================================================================
// Full Pipeline: Run all 3 steps
// =============================================================================

export async function runScanPipeline(
  settings: AppSettings
): Promise<{ leads: Lead[]; drafts: Draft[]; result: ScanResult }> {
  const errors: string[] = [];
  const leads: Lead[] = [];
  const drafts: Draft[] = [];

  // Step 1: Monitor LinkedIn
  let rawPosts: RawLinkedInPost[] = [];
  try {
    rawPosts = await monitorLinkedIn(
      settings.forumScoutApiKey,
      settings.keywords,
      settings.maxResults
    );
  } catch (err) {
    errors.push(
      `LinkedIn monitor: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Step 2: AI Analysis
  let analysisResults: AnalysisResult[] = [];
  if (rawPosts.length > 0) {
    try {
      analysisResults = await analyzePostsWithAI(
        settings.anthropicApiKey,
        rawPosts,
        settings.topic,
        settings.userIntent
      );
    } catch (err) {
      errors.push(
        `AI analysis: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Merge raw posts with analysis into Lead objects
  for (const analysis of analysisResults) {
    const rawPost = rawPosts.find((p) => p.id === analysis.id);
    if (!rawPost) continue;

    leads.push({
      id: rawPost.id,
      platform: "linkedin",
      postUrl: rawPost.url,
      postText: rawPost.text,
      authorName: rawPost.authorName,
      authorHandle: rawPost.authorHandle,
      authorUrl: rawPost.authorUrl,
      authorHeadline: rawPost.authorHeadline,
      authorFollowers: rawPost.authorFollowers,
      engagement: rawPost.engagement,
      postedAt: rawPost.postedAt,
      relevanceScore: analysis.relevanceScore,
      sentiment: analysis.sentiment as Lead["sentiment"],
      isComplaint: analysis.isComplaint,
      urgencyLevel: analysis.urgencyLevel as Lead["urgencyLevel"],
      aiSummary: analysis.aiSummary,
      matchedKeywords: analysis.matchedKeywords,
      status: "new",
      scannedAt: new Date().toISOString(),
    });
  }

  // Step 3: Draft outreach for high-priority leads
  const highPriority = leads.filter(
    (l) => l.relevanceScore >= 60 || l.urgencyLevel === "high"
  );

  for (const lead of highPriority.slice(0, 10)) {
    try {
      const { subject, body } = await draftOutreach(
        settings.anthropicApiKey,
        lead,
        settings
      );
      drafts.push({
        id: `draft-${lead.id}-${Date.now()}`,
        leadId: lead.id,
        toName: lead.authorName,
        toEmail: "", // LinkedIn doesn't give email — you'd use Apollo for this
        toCompany: "",
        toTitle: lead.authorHeadline || "",
        subject,
        body,
        status: "draft",
        createdAt: new Date().toISOString(),
      });

      // Brief pause to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      // Continue with next lead
    }
  }

  return {
    leads,
    drafts,
    result: {
      leadsFound: leads.length,
      draftsGenerated: drafts.length,
      timestamp: new Date().toISOString(),
      errors,
    },
  };
}
