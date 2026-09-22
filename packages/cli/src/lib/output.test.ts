/**
 * The CLI result envelope and its exit codes.
 *
 * An agent branches on the exit code, so the codes have to stay distinguishable
 * and stay documented. The four cases below are the ones a caller makes different
 * decisions about: the skill is absent, the credentials are wrong, the network is
 * down, or the target is not compatible.
 */

import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client.js";
import {
  EXIT_CODES,
  exitCodeFor,
  failure,
  fromError,
  serialize,
  success,
} from "./output.js";

describe("exit codes", () => {
  it("uses distinct codes for decisions a caller makes differently", () => {
    const codes = Object.values(EXIT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is 0 for success", () => {
    expect(exitCodeFor(success({ anything: true }))).toBe(EXIT_CODES.ok);
  });

  it("is 4 for an incompatible target, which is not a generic failure", () => {
    expect(exitCodeFor(failure("incompatible", "no"))).toBe(EXIT_CODES.incompatible);
  });

  it("is 2 for a usage error and 3 for a missing skill", () => {
    expect(exitCodeFor(failure("usage_error", "no"))).toBe(EXIT_CODES.usage);
    expect(exitCodeFor(failure("not_found", "no"))).toBe(EXIT_CODES.notFound);
  });
});

describe("fromError", () => {
  it("maps a 404 to not_found", () => {
    const envelope = fromError(new ApiError(404, "API error 404: {}"));
    expect(envelope.error.code).toBe("not_found");
    expect(exitCodeFor(envelope)).toBe(EXIT_CODES.notFound);
  });

  it.each([401, 403])("maps %s to auth_error with a hint", (status) => {
    const envelope = fromError(new ApiError(status, "denied"));
    expect(envelope.error.code).toBe("auth_error");
    expect(envelope.error.hint).toContain("apiKey");
    expect(exitCodeFor(envelope)).toBe(EXIT_CODES.auth);
  });

  it("maps a fetch TypeError to network_error", () => {
    const envelope = fromError(new TypeError("fetch failed"));
    expect(envelope.error.code).toBe("network_error");
    expect(exitCodeFor(envelope)).toBe(EXIT_CODES.network);
  });

  it("maps any other API status to api_error", () => {
    expect(fromError(new ApiError(500, "boom")).error.code).toBe("api_error");
  });

  it("maps an unknown throw to unexpected_error without losing the message", () => {
    const envelope = fromError(new Error("something odd"));
    expect(envelope.error.code).toBe("unexpected_error");
    expect(envelope.error.message).toBe("something odd");
  });

  it("survives a non-Error throw", () => {
    expect(fromError("plain string").error.code).toBe("unexpected_error");
  });
});

describe("serialize", () => {
  it("emits an envelope a program can parse", () => {
    const parsed = JSON.parse(serialize(success({ count: 2 })));
    expect(parsed).toEqual({ ok: true, data: { count: 2 } });
  });

  it("keeps details and hint out of the envelope when they were not supplied", () => {
    const parsed = JSON.parse(serialize(failure("api_error", "boom")));
    expect(parsed).toEqual({ ok: false, error: { code: "api_error", message: "boom" } });
  });

  it("carries machine-readable details when present", () => {
    const parsed = JSON.parse(
      serialize(failure("incompatible", "blocked", { details: { reasonCodes: ["COMPAT_RANGE_MISMATCH"] } })),
    );
    expect(parsed.error.details.reasonCodes).toEqual(["COMPAT_RANGE_MISMATCH"]);
  });
});
