// GET /api/leads — List all leads
// PATCH /api/leads — Update a lead's status
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLead } from "@/lib/db";

export async function GET() {
  const leads = getLeads();
  // Return sorted by relevance score, newest first
  leads.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return NextResponse.json(leads);
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json();
  if (!id || !status) {
    return NextResponse.json(
      { error: "id and status required" },
      { status: 400 }
    );
  }
  const updated = updateLead(id, { status });
  if (!updated) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
