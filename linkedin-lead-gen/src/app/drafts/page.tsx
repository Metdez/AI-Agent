"use client";

import { useState, useEffect } from "react";

interface Draft {
  id: string;
  leadId: string;
  toName: string;
  toTitle: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/drafts")
      .then((r) => r.json())
      .then(setDrafts)
      .catch(() => {});
  }, []);

  async function updateDraft(
    id: string,
    update: Partial<Draft>
  ) {
    const res = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...update }),
    });
    const updated = await res.json();
    setDrafts((prev) => prev.map((d) => (d.id === id ? updated : d)));
    setEditing(null);
  }

  function startEdit(draft: Draft) {
    setEditing(draft.id);
    setEditSubject(draft.subject);
    setEditBody(draft.body);
  }

  const filtered =
    filter === "all"
      ? drafts
      : drafts.filter((d) => d.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Drafts ({filtered.length})</h1>
        <div className="flex gap-2 text-sm">
          {["all", "draft", "approved", "rejected"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full capitalize transition ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          No drafts yet. Run a scan to generate outreach messages.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((draft) => (
            <div
              key={draft.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-white">
                    To: {draft.toName}
                  </span>
                  {draft.toTitle && (
                    <span className="text-gray-500 text-sm ml-2">
                      ({draft.toTitle})
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    draft.status === "approved"
                      ? "bg-green-900/40 text-green-300"
                      : draft.status === "rejected"
                      ? "bg-red-900/40 text-red-300"
                      : "bg-amber-900/40 text-amber-300"
                  }`}
                >
                  {draft.status}
                </span>
              </div>

              {editing === draft.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                    placeholder="Subject"
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={6}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateDraft(draft.id, {
                          subject: editSubject,
                          body: editBody,
                        })
                      }
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded transition"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-xs bg-gray-700 text-gray-300 px-4 py-1.5 rounded transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-gray-400 mb-1">
                    Subject: {draft.subject}
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap mb-4">
                    {draft.body}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(draft)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-1.5 rounded transition"
                    >
                      Edit
                    </button>
                    {draft.status === "draft" && (
                      <>
                        <button
                          onClick={() =>
                            updateDraft(draft.id, { status: "approved" })
                          }
                          className="text-xs bg-green-800 hover:bg-green-700 text-white px-4 py-1.5 rounded transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            updateDraft(draft.id, { status: "rejected" })
                          }
                          className="text-xs bg-red-900 hover:bg-red-800 text-red-300 px-4 py-1.5 rounded transition"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="text-xs text-gray-600 mt-3">
                Created {new Date(draft.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
