// POST /api/scan — Trigger the full lead gen pipeline
import { NextResponse } from "next/server";
import { getSettings, addLeads, addDrafts } from "@/lib/db";
import { runScanPipeline } from "@/lib/workflow";

export async function POST() {
  const settings = getSettings();

  if (!settings.anthropicApiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured. Go to Settings." },
      { status: 400 }
    );
  }
  if (!settings.forumScoutApiKey) {
    return NextResponse.json(
      { error: "ForumScout API key not configured. Go to Settings." },
      { status: 400 }
    );
  }
  if (settings.keywords.length === 0) {
    return NextResponse.json(
      { error: "No keywords configured. Go to Settings." },
      { status: 400 }
    );
  }

  try {
    const { leads, drafts, result } = await runScanPipeline(settings);
    const newLeadsCount = addLeads(leads);
    const newDraftsCount = addDrafts(drafts);

    return NextResponse.json({
      ...result,
      newLeadsSaved: newLeadsCount,
      newDraftsSaved: newDraftsCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Pipeline failed",
      },
      { status: 500 }
    );
  }
}
