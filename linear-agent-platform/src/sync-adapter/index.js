import "dotenv/config";
import { LinearClient as LinearSDKClient } from "@linear/sdk";
import { dequeue, completeJob, failJob } from "../queue/dequeue.js";
import { getAgentForState } from "./state-router.js";
import { LinearClient } from "./linear-client.js";
import { dispatch } from "./agent-dispatcher.js";

const POLL_INTERVAL_MS = 2000;

let linearClient;

function getLinearClient() {
  if (!linearClient) {
    const sdk = new LinearSDKClient({ apiKey: process.env.LINEAR_API_KEY });
    linearClient = new LinearClient(sdk);
  }
  return linearClient;
}

async function processJob(job) {
  const client = getLinearClient();
  const agent = getAgentForState(job.state);

  if (!agent) {
    console.log(`No agent for state "${job.state}" on issue ${job.issue_id} — skipping`);
    await completeJob(job.id, { skipped: true, reason: "no agent for state" });
    return;
  }

  console.log(`Dispatching ${agent.name} agent for issue ${job.issue_id} (${job.state})`);

  // Fetch current issue context
  let issueContext;
  try {
    issueContext = await client.getIssue(job.issue_id);
  } catch (err) {
    console.error(`Failed to fetch issue ${job.issue_id}:`, err.message);
    await failJob(job.id, err.message);
    return;
  }

  // Get team states so agent can resolve state IDs
  let teamStates = [];
  try {
    teamStates = await client.getTeamStates(process.env.LINEAR_TEAM_ID);
  } catch (err) {
    console.warn("Failed to fetch team states:", err.message);
  }

  try {
    const result = await dispatch({
      issueId: job.issue_id,
      soulPath: agent.soulPath,
      context: { issue: issueContext, teamStates, job },
      linearClient: client,
    });

    // Move to next state if defined
    if (agent.nextState) {
      const nextStateObj = teamStates.find((s) => s.name === agent.nextState);
      if (nextStateObj) {
        await client.moveToState(job.issue_id, nextStateObj.id);
        await client.addComment(
          job.issue_id,
          `✅ Agent \`${agent.name}\` completed. Moving to **${agent.nextState}**.`
        );
      }
    }

    await completeJob(job.id, { agentName: agent.name });
    console.log(`Job ${job.id} completed by ${agent.name}`);
  } catch (err) {
    console.error(`Agent ${agent.name} failed for issue ${job.issue_id}:`, err.message);

    // Move to Blocked
    const blockedState = teamStates.find((s) => s.name === "Blocked");
    if (blockedState) {
      try {
        await client.moveToState(job.issue_id, blockedState.id);
        await client.addComment(
          job.issue_id,
          `❌ Agent \`${agent.name}\` failed: ${err.message}. Moving to **Blocked**.`
        );
      } catch (moveErr) {
        console.warn("Failed to move to Blocked:", moveErr.message);
      }
    }

    await failJob(job.id, err.message);
  }
}

async function poll() {
  try {
    const job = await dequeue();
    if (job) {
      await processJob(job);
    }
  } catch (err) {
    console.error("Poll error:", err.message);
  }
  setTimeout(poll, POLL_INTERVAL_MS);
}

console.log("Sync adapter starting, polling every", POLL_INTERVAL_MS, "ms");
poll();
