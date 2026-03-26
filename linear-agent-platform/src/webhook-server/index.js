import express from "express";
import { verifyLinearSignature } from "./middleware/verify-linear.js";
import { verifyGithubSignature } from "./middleware/verify-github.js";
import healthRouter from "./routes/health.js";
import linearRouter from "./routes/linear.js";
import githubRouter from "./routes/github.js";

export function createApp({ linearSecret, githubSecret } = {}) {
  const app = express();
  app.use(express.json());

  app.use(healthRouter);
  app.use(verifyLinearSignature(linearSecret), linearRouter);
  app.use(verifyGithubSignature(githubSecret), githubRouter);

  return app;
}

// Start the server when run directly or via PM2
// (Skip only when imported by test files)
const isTestImport = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
if (!isTestImport) {
  const { config } = await import("../config.js");
  const app = createApp({
    linearSecret: config.linear.webhookSecret,
    githubSecret: config.github.webhookSecret,
  });
  app.listen(config.server.port, () => {
    console.log(`Webhook server listening on port ${config.server.port}`);
  });
}
