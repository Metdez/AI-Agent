"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Stats {
  totalLeads: number;
  highPriority: number;
  pendingDrafts: number;
  contacted: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalLeads: 0,
    highPriority: 0,
    pendingDrafts: 0,
    contacted: 0,
  });
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [leadsRes, draftsRes] = await Promise.all([
        fetch("/api/leads"),
        fetch("/api/drafts"),
      ]);
      const leads = await leadsRes.json();
      const drafts = await draftsRes.json();

      setStats({
        totalLeads: leads.length,
        highPriority: leads.filter(
          (l: { urgencyLevel: string; relevanceScore: number }) =>
            l.urgencyLevel === "high" || l.relevanceScore >= 80
        ).length,
        pendingDrafts: drafts.filter(
          (d: { status: string }) => d.status === "draft"
        ).length,
        contacted: leads.filter(
          (l: { status: string }) => l.status === "contacted"
        ).length,
      });
    } catch {
      // Stats will show 0
    }
  }

  async function runScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setScanResult(`Error: ${data.error}`);
      } else {
        setScanResult(
          `Found ${data.leadsFound} leads, generated ${data.draftsGenerated} drafts`
        );
        loadStats();
      }
    } catch (err) {
      setScanResult(`Failed: ${err}`);
    } finally {
      setScanning(false);
    }
  }

  const cards = [
    {
      label: "Total Leads",
      value: stats.totalLeads,
      color: "text-blue-400",
      href: "/leads",
    },
    {
      label: "High Priority",
      value: stats.highPriority,
      color: "text-red-400",
      href: "/leads",
    },
    {
      label: "Pending Drafts",
      value: stats.pendingDrafts,
      color: "text-amber-400",
      href: "/drafts",
    },
    {
      label: "Contacted",
      value: stats.contacted,
      color: "text-green-400",
      href: "/leads",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={runScan}
          disabled={scanning}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg font-medium transition"
        >
          {scanning ? "Scanning LinkedIn..." : "Run Scan"}
        </button>
      </div>

      {scanResult && (
        <div
          className={`mb-6 p-4 rounded-lg text-sm ${
            scanResult.startsWith("Error") || scanResult.startsWith("Failed")
              ? "bg-red-900/30 text-red-300 border border-red-800"
              : "bg-green-900/30 text-green-300 border border-green-800"
          }`}
        >
          {scanResult}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition"
          >
            <div className={`text-3xl font-bold ${card.color}`}>
              {card.value}
            </div>
            <div className="text-gray-400 text-sm mt-1">{card.label}</div>
          </Link>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-gray-400">
          <div>
            <div className="text-white font-medium mb-2">
              1. Configure keywords
            </div>
            <p>
              Go to{" "}
              <Link href="/settings" className="text-blue-400 underline">
                Settings
              </Link>{" "}
              and add your API keys, target keywords, and product description.
            </p>
          </div>
          <div>
            <div className="text-white font-medium mb-2">2. Run a scan</div>
            <p>
              Hit &quot;Run Scan&quot; to monitor LinkedIn, analyze posts with
              AI, and auto-generate outreach drafts for the best leads.
            </p>
          </div>
          <div>
            <div className="text-white font-medium mb-2">
              3. Review &amp; reach out
            </div>
            <p>
              Browse your{" "}
              <Link href="/leads" className="text-blue-400 underline">
                leads
              </Link>{" "}
              and{" "}
              <Link href="/drafts" className="text-blue-400 underline">
                drafts
              </Link>
              , edit messages, then approve and send.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
