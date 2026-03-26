import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";

const AGENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function dispatch({ issueId, soulPath, context, linearClient }) {
  const workspacePath = path.join(os.tmpdir(), "agent-workspaces", issueId);

  // Ensure workspace exists
  await fs.mkdir(workspacePath, { recursive: true });

  // Post "agent starting" comment
  try {
    await linearClient.addComment(issueId, `🤖 Agent starting (soul: \`${path.basename(path.dirname(soulPath))}\`)...`);
  } catch (err) {
    console.warn("Failed to post start comment:", err.message);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["openclaw", "run", "--soul", soulPath], {
      env: {
        ...process.env,
        AGENT_CONTEXT: JSON.stringify(context),
        AGENT_WORKSPACE: workspacePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Agent timed out after ${AGENT_TIMEOUT_MS / 1000}s`));
    }, AGENT_TIMEOUT_MS);

    proc.on("close", async (code) => {
      clearTimeout(timer);

      // Clean up workspace
      try {
        await fs.rm(workspacePath, { recursive: true, force: true });
      } catch (err) {
        console.warn("Failed to clean workspace:", err.message);
      }

      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Agent exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
