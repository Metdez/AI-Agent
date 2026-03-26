export class LinearClient {
  constructor(sdk) {
    this.sdk = sdk;
  }

  async getIssue(issueId) {
    const issue = await this.sdk.issue(issueId);
    const [labels, comments] = await Promise.all([
      issue.labels(),
      issue.comments(),
    ]);
    return {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      state: issue.state,
      labels: labels.nodes.map((l) => l.name),
      comments: comments.nodes.map((c) => ({ body: c.body, author: c.user?.name })),
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
