// =============================================================================
// Simple JSON file database
// Good enough for MVP — swap for SQLite or Postgres later
// =============================================================================

import fs from "fs";
import path from "path";
import type { Lead, Draft, AppSettings } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filename: string, data: unknown) {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// -- Leads --

export function getLeads(): Lead[] {
  return readJson<Lead[]>("leads.json", []);
}

export function addLeads(newLeads: Lead[]) {
  const existing = getLeads();
  const existingIds = new Set(existing.map((l) => l.id));
  const unique = newLeads.filter((l) => !existingIds.has(l.id));
  writeJson("leads.json", [...existing, ...unique]);
  return unique.length;
}

export function updateLead(id: string, update: Partial<Lead>) {
  const leads = getLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  leads[idx] = { ...leads[idx], ...update };
  writeJson("leads.json", leads);
  return leads[idx];
}

// -- Drafts --

export function getDrafts(): Draft[] {
  return readJson<Draft[]>("drafts.json", []);
}

export function addDrafts(newDrafts: Draft[]) {
  const existing = getDrafts();
  writeJson("drafts.json", [...existing, ...newDrafts]);
  return newDrafts.length;
}

export function updateDraft(id: string, update: Partial<Draft>) {
  const drafts = getDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  drafts[idx] = { ...drafts[idx], ...update };
  writeJson("drafts.json", drafts);
  return drafts[idx];
}

// -- Settings --

const DEFAULT_SETTINGS: AppSettings = {
  keywords: [],
  maxResults: 25,
  topic: "",
  userIntent: "",
  productDescription: "",
  senderName: "",
  anthropicApiKey: "",
  forumScoutApiKey: "",
};

export function getSettings(): AppSettings {
  return readJson<AppSettings>("settings.json", DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings) {
  writeJson("settings.json", settings);
}
