export class LinearClient {
  constructor(sdk) {
    this.sdk = sdk;
  }

  async getIssue(issueId) {
    const issue = await this.sdk.issue(issueId);
    const labelsResult = await issue.labels();
    const commentsResult = await issue.comments();

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || "",
      stateName: issue.state?.name || "Unknown",
      labels: labelsResult.nodes.map((l) => l.name),
      comments: commentsResult.nodes.map((c) => ({
        body: c.body,
        createdAt: c.createdAt,
      })),
      assignee: issue.assignee
        ? { name: issue.assignee.name, email: issue.assignee.email }
        : null,
    };
  }

  async addComment(issueId, body) {
    await this.sdk.createComment({ issueId, body });
  }

  async moveToState(issueId, stateId) {
    await this.sdk.updateIssue(issueId, { stateId });
  }

  async getTeamStates(teamId) {
    const team = await this.sdk.team(teamId);
    const states = await team.states();
    return states.nodes.map((s) => ({ id: s.id, name: s.name, type: s.type }));
  }
}
