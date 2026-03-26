import { Router } from "express";
import { isDuplicate, markProcessed } from "../../redis/client.js";
import { enqueue } from "../../queue/enqueue.js";

const router = Router();

router.post("/webhook/linear", async (req, res) => {
  try {
    const { action, type, data } = req.body;

    if (type !== "Issue" || !data?.state?.name) {
      return res.json({ skipped: true, reason: "not an issue state change" });
    }

    const issueId = data.identifier || data.id;
    const state = data.state.name;

    if (await isDuplicate(issueId, state)) {
      return res.json({ skipped: true, reason: "duplicate" });
    }

    await markProcessed(issueId, state);

    const jobId = await enqueue({
      source: "linear",
      eventType: `${type}.${action}`,
      issueId,
      state,
      payload: req.body,
    });

    res.json({ queued: true, jobId });
  } catch (err) {
    console.error("Linear webhook error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
