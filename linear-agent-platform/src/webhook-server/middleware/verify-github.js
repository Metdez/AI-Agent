import crypto from "crypto";

export function verifyGithubSignature(secret) {
  return (req, res, next) => {
    if (!secret) {
      return next();
    }

    const signature = req.headers["x-hub-signature-256"];
    if (!signature) {
      return res.status(401).json({ error: "Missing GitHub signature" });
    }

    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      valid = false;
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid GitHub signature" });
    }

    next();
  };
}
