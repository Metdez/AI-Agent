import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";
import path from "path";

export class GithubClient {
  constructor(pat) {
    this.octokit = new Octokit({ auth: pat });
    this.pat = pat;
  }

  cloneRepo(repoUrl, workspacePath) {
    // Inject PAT into https clone URL
    const authedUrl = repoUrl.replace("https://", `https://x-access-token:${this.pat}@`);
    execSync(`git clone ${authedUrl} ${workspacePath}`, { stdio: "pipe" });
  }

  createBranch(workspacePath, branchName) {
    execSync(`git -C ${workspacePath} checkout -b ${branchName}`, { stdio: "pipe" });
  }

  commitAndPush(workspacePath, message, branchName) {
    execSync(`git -C ${workspacePath} add -A`, { stdio: "pipe" });
    execSync(`git -C ${workspacePath} commit -m "${message}"`, { stdio: "pipe" });
    execSync(`git -C ${workspacePath} push origin ${branchName}`, { stdio: "pipe" });
  }

  async createPullRequest(owner, repo, head, base, title, body) {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      head,
      base,
      title,
      body,
      draft: true,
    });
    return data;
  }

  async getPullRequestDiff(owner, repo, pullNumber) {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: { format: "diff" },
    });
    return data;
  }

  async mergePullRequest(owner, repo, pullNumber) {
    const { data } = await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: "squash",
    });
    return data;
  }

  async triggerWorkflow(owner, repo, workflowId, ref) {
    await this.octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowId,
      ref,
    });
  }
}
