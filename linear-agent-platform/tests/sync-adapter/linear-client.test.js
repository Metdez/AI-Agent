import { describe, it, expect, vi } from "vitest";
import { LinearClient } from "../../src/sync-adapter/linear-client.js";

function makeSdk({ issue, createComment, updateIssue, team } = {}) {
  return {
    issue: vi.fn().mockResolvedValue(issue),
    createComment: vi.fn().mockResolvedValue(undefined),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    team: vi.fn().mockResolvedValue(team),
  };
}

describe("LinearClient", () => {
  describe("getIssue", () => {
    it("returns structured issue data", async () => {
      const fakeIssue = {
        id: "issue-1",
        title: "Fix the bug",
        description: "Something is broken",
        state: { name: "In Progress" },
        labels: vi.fn().mockResolvedValue({ nodes: [{ name: "bug" }] }),
        comments: vi.fn().mockResolvedValue({
          nodes: [{ body: "Looking into it", user: { name: "Alice" } }],
        }),
      };

      const sdk = makeSdk({ issue: fakeIssue });
      const client = new LinearClient(sdk);
      const result = await client.getIssue("issue-1");

      expect(result.id).toBe("issue-1");
      expect(result.title).toBe("Fix the bug");
      expect(result.labels).toEqual(["bug"]);
      expect(result.comments).toEqual([{ body: "Looking into it", author: "Alice" }]);
    });
  });

  describe("addComment", () => {
    it("calls sdk.createComment with correct args", async () => {
      const sdk = makeSdk();
      const client = new LinearClient(sdk);
      await client.addComment("issue-1", "Hello world");
      expect(sdk.createComment).toHaveBeenCalledWith({ issueId: "issue-1", body: "Hello world" });
    });
  });

  describe("moveToState", () => {
    it("calls sdk.updateIssue with stateId", async () => {
      const sdk = makeSdk();
      const client = new LinearClient(sdk);
      await client.moveToState("issue-1", "state-99");
      expect(sdk.updateIssue).toHaveBeenCalledWith("issue-1", { stateId: "state-99" });
    });
  });

  describe("getTeamStates", () => {
    it("returns array of state objects", async () => {
      const fakeTeam = {
        states: vi.fn().mockResolvedValue({
          nodes: [
            { id: "s1", name: "Triage", type: "triage" },
            { id: "s2", name: "In Progress", type: "started" },
          ],
        }),
      };

      const sdk = makeSdk({ team: fakeTeam });
      const client = new LinearClient(sdk);
      const states = await client.getTeamStates("team-1");

      expect(states).toHaveLength(2);
      expect(states[0]).toEqual({ id: "s1", name: "Triage", type: "triage" });
    });
  });
});
