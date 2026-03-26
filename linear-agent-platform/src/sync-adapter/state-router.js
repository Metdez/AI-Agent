import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(__dirname, "../../agents");

export const STATE_AGENT_MAP = {
  "Triage":      { name: "triage",   nextState: "Backlog"     },
  "Backlog":     { name: "planning", nextState: "In Progress" },
  "In Progress": { name: "dev",      nextState: "In Review"   },
  "In Review":   { name: "review",   nextState: "QA"          },
  "QA":          { name: "qa",       nextState: "Staging"     },
  "Staging":     { name: "staging",  nextState: "Done"        },
  "Blocked":     { name: "blocked",  nextState: null          },
};

const TERMINAL_STATES = ["Done", "Cancelled", "Client Request"];

export function getAgentForState(stateName) {
  if (TERMINAL_STATES.includes(stateName)) return null;
  const mapping = STATE_AGENT_MAP[stateName];
  if (!mapping) return null;
  return {
    name: mapping.name,
    soulPath: path.join(AGENTS_DIR, mapping.name, "SOUL.md"),
    nextState: mapping.nextState,
  };
}
