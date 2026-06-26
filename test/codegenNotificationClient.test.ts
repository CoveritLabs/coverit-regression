// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import CodegenNotificationClient from "@/workerFlow/codegenNotificationClient";

test("CodegenNotificationClient posts generated payload to internal API", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ message: "ok" }), { status: 202 });
  }) as typeof fetch;

  try {
    const client = new CodegenNotificationClient({
      baseUrl: "https://api.coverit.test/",
      internalServiceToken: "internal-token",
    });

    await client.notifyGenerated(
      "session-1",
      {
        branchName: "codegen/1",
        changedFiles: ["tests/regression.spec.ts"],
        noChanges: false,
        pushed: true,
        pullRequest: { url: "https://github.com/acme/shop/pull/1", number: 1 },
      },
      ["flow-1"],
    );

    assert.equal(
      calls[0].input,
      "https://api.coverit.test/api/v1/internal/notifications/codegen/session-1/notifications",
    );
    assert.equal(calls[0].init?.method, "POST");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-CoverIt-Internal-Token"], "internal-token");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      status: "generated",
      branchName: "codegen/1",
      changedFiles: ["tests/regression.spec.ts"],
      noChanges: false,
      pushed: true,
      pullRequestUrl: "https://github.com/acme/shop/pull/1",
      flowIds: ["flow-1"],
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("CodegenNotificationClient posts failed payload to internal API", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ message: "ok" }), { status: 202 });
  }) as typeof fetch;

  try {
    const client = new CodegenNotificationClient({
      baseUrl: "https://api.coverit.test",
      internalServiceToken: "internal-token",
    });

    await client.notifyFailed("session-1", "push failed");

    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      status: "failed",
      errorMessage: "push failed",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
