import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyGithubSignature } from "../../src/webhook-server/middleware/verify-github.js";

function signPayload(body, secret) {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");
  return `sha256=${sig}`;
}

describe("verifyGithubSignature", () => {
  const secret = "gh-test-secret";
  const body = { action: "completed", check_run: { id: 1 } };

  it("calls next() when signature is valid", () => {
    const signature = signPayload(body, secret);
    const req = { headers: { "x-hub-signature-256": signature }, body };
    let nextCalled = false;
    verifyGithubSignature(secret)(req, { status: () => ({ json: () => {} }) }, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it("returns 401 when signature is missing", () => {
    const req = { headers: {}, body };
    let statusCode;
    const res = { status: (c) => { statusCode = c; return { json: () => {} }; } };
    verifyGithubSignature(secret)(req, res, () => {});
    expect(statusCode).toBe(401);
  });

  it("returns 401 when signature is invalid", () => {
    const req = { headers: { "x-hub-signature-256": "sha256=bad" }, body };
    let statusCode;
    const res = { status: (c) => { statusCode = c; return { json: () => {} }; } };
    verifyGithubSignature(secret)(req, res, () => {});
    expect(statusCode).toBe(401);
  });

  it("skips verification when no secret is configured", () => {
    const req = { headers: {}, body };
    let nextCalled = false;
    verifyGithubSignature(null)(req, {}, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});
