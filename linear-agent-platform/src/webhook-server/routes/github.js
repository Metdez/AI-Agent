import { Router } from "express";
import { enqueue } from "../../queue/enqueue.js";

const router = Router();

router.post("/webhook/github", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    const payload = req.body;

    await enqueue({
      source: "github",
      eventType: event || "unknown",
      issueId: String(payload?.issue?.number || payload?.pull_request?.number || "0"),
      state: payload?.action || "unknown",
      payload,
    });

    res.status(202).json({ queued: true });
  } catch (err) {
    console.error("GitHub webhook error", err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
