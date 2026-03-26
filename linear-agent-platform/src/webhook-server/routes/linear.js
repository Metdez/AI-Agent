import { Router } from "express";
import { isDuplicate, markProcessed } from "../../redis/client.js";
import { enqueue } from "../../queue/enqueue.js";

const router = Router();

router.post("/webhook/linear", async (req, res) => {
  try {
    const { action, type, data } = req.body;

    if (!data?.id || !data?.state?.name) {
      return res.status(200).json({ skipped: true, reason: "missing issue id or state" });
    }

    const issueId = data.id;
    const state = data.state.name;

    const dup = await isDuplicate(issueId, state);
    if (dup) {
      return res.status(200).json({ skipped: true, reason: "duplicate" });
    }

    await markProcessed(issueId, state);
    await enqueue({
      source: "linear",
      eventType: type || "Issue",
      issueId,
      state,
      payload: req.body,
    });

    res.status(202).json({ queued: true });
  } catch (err) {
    console.error("Linear webhook error", err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
