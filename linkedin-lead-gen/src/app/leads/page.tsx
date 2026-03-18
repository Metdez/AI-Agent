"use client";

import { useState, useEffect } from "react";

interface Lead {
  id: string;
  postUrl: string;
  postText: string;
  authorName: string;
  authorHandle: string;
  authorUrl: string;
  authorHeadline?: string;
  authorFollowers: number;
  engagement: { likes: number; comments: number; shares: number };
  relevanceScore: number;
  sentiment: string;
  isComplaint: boolean;
  urgencyLevel: string;
  aiSummary: string;
  matchedKeywords: string[];
  status: string;
  scannedAt: string;
}

const URGENCY_COLORS: Record<string, string> = {
  high: "bg-red-900/40 text-red-300 border-red-800",
  medium: "bg-amber-900/40 text-amber-300 border-amber-800",
  low: "bg-gray-800 text-gray-400 border-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-900/40 text-blue-300",
  reviewing: "bg-amber-900/40 text-amber-300",
  contacted: "bg-green-900/40 text-green-300",
  dismissed: "bg-gray-800 text-gray-500",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then(setLeads)
      .catch(() => {});
  }, []);

  async function updateStatus(id: string, status: string) {
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status } : l))
    );
  }

  const filtered =
    filter === "all"
      ? leads
      : leads.filter((l) =>
          filter === "high-priority"
            ? l.urgencyLevel === "high" || l.relevanceScore >= 80
            : l.status === filter
        );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leads ({filtered.length})</h1>
        <div className="flex gap-2 text-sm">
          {["all", "new", "high-priority", "reviewing", "contacted", "dismissed"].map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full capitalize transition ${
                  filter === f
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {f.replace("-", " ")}
              </button>
            )
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          No leads yet. Run a scan from the Dashboard.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <a
                      href={lead.authorUrl}
                      target="_blank"
                      rel="noopener"
                      className="font-semibold text-white hover:text-blue-400 transition"
                    >
                      {lead.authorName}
                    </a>
                    <span className="text-gray-500 text-sm">
                      {lead.authorHeadline}
                    </span>
                    <span className="text-gray-600 text-xs">
                      {lead.authorFollowers.toLocaleString()} followers
                    </span>
                  </div>

                  <p className="text-gray-300 text-sm mb-3 line-clamp-3">
                    {lead.postText}
                  </p>

                  <div className="bg-gray-800/50 rounded-lg p-3 mb-3">
                    <div className="text-xs text-gray-500 mb-1">AI Summary</div>
                    <p className="text-sm text-gray-300">{lead.aiSummary}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        URGENCY_COLORS[lead.urgencyLevel] || URGENCY_COLORS.low
                      }`}
                    >
                      {lead.urgencyLevel} urgency
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                      {lead.sentiment}
                    </span>
                    {lead.isComplaint && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">
                        complaint
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[lead.status] || STATUS_COLORS.new
                      }`}
                    >
                      {lead.status}
                    </span>
                    {lead.matchedKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-xs px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-2xl font-bold text-blue-400">
                    {lead.relevanceScore}
                  </div>
                  <div className="text-xs text-gray-500">relevance</div>

                  <div className="flex gap-1 mt-2 text-xs">
                    <span className="text-gray-500">
                      {lead.engagement.likes}♥
                    </span>
                    <span className="text-gray-500">
                      {lead.engagement.comments}💬
                    </span>
                  </div>

                  <div className="flex gap-1 mt-3">
                    {lead.status !== "contacted" && (
                      <button
                        onClick={() => updateStatus(lead.id, "contacted")}
                        className="text-xs bg-green-800 hover:bg-green-700 text-white px-3 py-1 rounded transition"
                      >
                        Mark Contacted
                      </button>
                    )}
                    {lead.status !== "dismissed" && (
                      <button
                        onClick={() => updateStatus(lead.id, "dismissed")}
                        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded transition"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>

                  <a
                    href={lead.postUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-blue-400 hover:underline mt-1"
                  >
                    View post →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
