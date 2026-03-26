import "dotenv/config";
import express from "express";
import { config } from "../config.js";
import { verifyLinearSignature } from "./middleware/verify-linear.js";
import { verifyGithubSignature } from "./middleware/verify-github.js";
import healthRoutes from "./routes/health.js";
import linearRoutes from "./routes/linear.js";
import githubRoutes from "./routes/github.js";

const app = express();

app.use(express.json());

app.use("/webhook/linear", verifyLinearSignature(config.linear.webhookSecret));
app.use("/webhook/github", verifyGithubSignature(config.github.webhookSecret));

app.use(healthRoutes);
app.use(linearRoutes);
app.use(githubRoutes);

const port = config.server.port;
app.listen(port, () => {
  console.log(`Webhook server listening on port ${port}`);
});

export default app;
