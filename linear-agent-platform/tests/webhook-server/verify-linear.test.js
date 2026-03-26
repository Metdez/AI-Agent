import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyLinearSignature } from "../../src/webhook-server/middleware/verify-linear.js";

function signPayload(body, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");
}

describe("verifyLinearSignature", () => {
  const secret = "test-webhook-secret";
  const body = { action: "update", type: "Issue", data: { id: "123" } };

  it("calls next() when signature is valid", () => {
    const signature = signPayload(body, secret);
    const req = {
      headers: { "linear-signature": signature },
      body,
    };
    const res = {
      status: (code) => ({ json: (msg) => ({ code, msg }) }),
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    verifyLinearSignature(secret)(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it("returns 401 when signature is missing", () => {
    const req = { headers: {}, body };
    let statusCode;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
    };
    const next = () => {};

    verifyLinearSignature(secret)(req, res, next);
    expect(statusCode).toBe(401);
  });

  it("returns 401 when signature is invalid", () => {
    const req = {
      headers: { "linear-signature": "bad-sig" },
      body,
    };
    let statusCode;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
    };
    const next = () => {};

    verifyLinearSignature(secret)(req, res, next);
    expect(statusCode).toBe(401);
  });

  it("skips verification when no secret is configured", () => {
    const req = { headers: {}, body };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const res = {};

    verifyLinearSignature(null)(req, res, next);
    expect(nextCalled).toBe(true);
  });
});
