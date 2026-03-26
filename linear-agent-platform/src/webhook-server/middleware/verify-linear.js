import crypto from "crypto";

export function verifyLinearSignature(secret) {
  return (req, res, next) => {
    if (!secret) {
      return next();
    }

    const signature = req.headers["linear-signature"];
    if (!signature) {
      return res.status(401).json({ error: "Missing Linear signature" });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch (err) {
      // Buffers have different lengths, signature is invalid
      valid = false;
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid Linear signature" });
    }

    next();
  };
}
