import { describe, it, expect } from "vitest";
import { getAgentForState, STATE_AGENT_MAP } from "../../src/sync-adapter/state-router.js";
import path from "path";

describe("getAgentForState", () => {
  it("returns triage agent for Triage state", () => {
    const result = getAgentForState("Triage");
    expect(result.name).toBe("triage");
    expect(result.nextState).toBe("Backlog");
    expect(result.soulPath).toContain(path.join("agents", "triage", "SOUL.md"));
  });

  it("returns planning agent for Backlog state", () => {
    const result = getAgentForState("Backlog");
    expect(result.name).toBe("planning");
    expect(result.nextState).toBe("In Progress");
  });

  it("returns dev agent for In Progress state", () => {
    const result = getAgentForState("In Progress");
    expect(result.name).toBe("dev");
    expect(result.nextState).toBe("In Review");
  });

  it("returns review agent for In Review state", () => {
    const result = getAgentForState("In Review");
    expect(result.name).toBe("review");
    expect(result.nextState).toBe("QA");
  });

  it("returns qa agent for QA state", () => {
    const result = getAgentForState("QA");
    expect(result.name).toBe("qa");
    expect(result.nextState).toBe("Staging");
  });

  it("returns staging agent for Staging state", () => {
    const result = getAgentForState("Staging");
    expect(result.name).toBe("staging");
    expect(result.nextState).toBe("Done");
  });

  it("returns blocked agent with null nextState for Blocked state", () => {
    const result = getAgentForState("Blocked");
    expect(result.name).toBe("blocked");
    expect(result.nextState).toBeNull();
  });

  it("returns null for Done (terminal)", () => {
    expect(getAgentForState("Done")).toBeNull();
  });

  it("returns null for Cancelled (terminal)", () => {
    expect(getAgentForState("Cancelled")).toBeNull();
  });

  it("returns null for unknown state", () => {
    expect(getAgentForState("Whatever")).toBeNull();
  });
});
