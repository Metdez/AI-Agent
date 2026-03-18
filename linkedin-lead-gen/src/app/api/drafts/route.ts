// GET /api/drafts — List all drafts
// PATCH /api/drafts — Update a draft (edit body, change status)
import { NextRequest, NextResponse } from "next/server";
import { getDrafts, updateDraft } from "@/lib/db";

export async function GET() {
  const drafts = getDrafts();
  drafts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json(drafts);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...update } = body;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const updated = updateDraft(id, update);
  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
