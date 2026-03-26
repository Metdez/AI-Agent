import { describe, it, expect, vi } from "vitest";
import { LinearClient } from "../../src/sync-adapter/linear-client.js";

describe("LinearClient", () => {
  it("getIssue fetches issue with full context", async () => {
    const mockSdk = {
      issue: vi.fn().mockResolvedValue({
        id: "issue-1",
        identifier: "DRN-42",
        title: "Fix login bug",
        description: "Users can't log in",
        state: { name: "In Progress" },
        labels: vi.fn().mockResolvedValue({ nodes: [{ name: "bug" }] }),
        comments: vi.fn().mockResolvedValue({
          nodes: [{ body: "Started work", createdAt: "2026-01-01" }],
        }),
        assignee: { name: "Zack", email: "zack@test.com" },
      }),
    };

    const client = new LinearClient(mockSdk);
    const issue = await client.getIssue("issue-1");

    expect(issue.identifier).toBe("DRN-42");
    expect(issue.title).toBe("Fix login bug");
    expect(issue.stateName).toBe("In Progress");
    expect(issue.labels).toEqual(["bug"]);
  });

  it("addComment posts a comment to an issue", async () => {
    const mockSdk = {
      createComment: vi.fn().mockResolvedValue({ success: true }),
    };

    const client = new LinearClient(mockSdk);
    await client.addComment("issue-1", "Agent completed task");

    expect(mockSdk.createComment).toHaveBeenCalledWith({
      issueId: "issue-1",
      body: "Agent completed task",
    });
  });
});
