import { Router } from "express";
import { enqueue } from "../../queue/enqueue.js";

const router = Router();

router.post("/webhook/github", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    const { action } = req.body;

    const jobId = await enqueue({
      source: "github",
      eventType: `${event}.${action}`,
      issueId: null,
      state: null,
      payload: req.body,
    });

    res.json({ queued: true, jobId });
  } catch (err) {
    console.error("GitHub webhook error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
