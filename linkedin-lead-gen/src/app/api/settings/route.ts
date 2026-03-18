// GET /api/settings — Load settings
// POST /api/settings — Save settings
import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";

export async function GET() {
  const settings = getSettings();
  // Mask API keys for the frontend
  return NextResponse.json({
    ...settings,
    anthropicApiKey: settings.anthropicApiKey ? "••••••" + settings.anthropicApiKey.slice(-4) : "",
    forumScoutApiKey: settings.forumScoutApiKey ? "••••••" + settings.forumScoutApiKey.slice(-4) : "",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const current = getSettings();

  // Only overwrite API keys if new values are provided (not masked)
  const updated = {
    ...current,
    ...body,
    anthropicApiKey:
      body.anthropicApiKey && !body.anthropicApiKey.startsWith("••••••")
        ? body.anthropicApiKey
        : current.anthropicApiKey,
    forumScoutApiKey:
      body.forumScoutApiKey && !body.forumScoutApiKey.startsWith("••••••")
        ? body.forumScoutApiKey
        : current.forumScoutApiKey,
  };

  saveSettings(updated);
  return NextResponse.json({ success: true });
}
