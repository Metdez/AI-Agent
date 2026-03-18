"use client";

import { useState, useEffect } from "react";

interface Settings {
  keywords: string[];
  maxResults: number;
  topic: string;
  userIntent: string;
  productDescription: string;
  senderName: string;
  emailTemplate: string;
  anthropicApiKey: string;
  forumScoutApiKey: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    keywords: [],
    maxResults: 25,
    topic: "",
    userIntent: "",
    productDescription: "",
    senderName: "",
    emailTemplate: "",
    anthropicApiKey: "",
    forumScoutApiKey: "",
  });
  const [keywordsText, setKeywordsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setKeywordsText((data.keywords || []).join(", "));
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    const payload = {
      ...settings,
      keywords: keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    };
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* API Keys */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4">API Keys</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Anthropic API Key (for AI analysis + drafting)
              </label>
              <input
                type="password"
                value={settings.anthropicApiKey}
                onChange={(e) =>
                  setSettings({ ...settings, anthropicApiKey: e.target.value })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="sk-ant-..."
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                ForumScout API Key (for LinkedIn monitoring)
              </label>
              <input
                type="password"
                value={settings.forumScoutApiKey}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    forumScoutApiKey: e.target.value,
                  })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="fs_..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Get a key at{" "}
                <a
                  href="https://forumscout.app"
                  target="_blank"
                  className="text-blue-400"
                >
                  forumscout.app
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* LinkedIn Monitoring */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4">LinkedIn Monitoring</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Keywords (comma separated)
              </label>
              <input
                type="text"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="project management, task tracking, team collaboration"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Max results per scan
              </label>
              <input
                type="number"
                value={settings.maxResults}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxResults: parseInt(e.target.value) || 25,
                  })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
        </section>

        {/* AI Analysis */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4">AI Analysis</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Topic / Product Category
              </label>
              <input
                type="text"
                value={settings.topic}
                onChange={(e) =>
                  setSettings({ ...settings, topic: e.target.value })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="e.g. Project management software"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                User Intent (what you&apos;re looking for)
              </label>
              <textarea
                value={settings.userIntent}
                onChange={(e) =>
                  setSettings({ ...settings, userIntent: e.target.value })
                }
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-y"
                placeholder="e.g. Find people frustrated with existing tools or actively looking for alternatives"
              />
            </div>
          </div>
        </section>

        {/* Outreach */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4">Outreach</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={settings.senderName}
                onChange={(e) =>
                  setSettings({ ...settings, senderName: e.target.value })
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Product Description
              </label>
              <textarea
                value={settings.productDescription}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    productDescription: e.target.value,
                  })
                }
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-y"
                placeholder="Describe your SaaS product in 2-3 sentences. This is used by AI to draft personalized outreach."
              />
            </div>
          </div>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
