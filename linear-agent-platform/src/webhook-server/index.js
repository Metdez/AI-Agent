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

// Only start the server when run directly
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  const { config } = await import("../config.js");
  const app = createApp({
    linearSecret: config.linear.webhookSecret,
    githubSecret: config.github.webhookSecret,
  });
  app.listen(config.server.port, () => {
    console.log(`Webhook server listening on port ${config.server.port}`);
  });
}
