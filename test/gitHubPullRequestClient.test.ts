// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import test from "node:test";
import assert from "node:assert/strict";

import GitHubPullRequestClient, { FetchLike } from "@workflow/gitHubPullRequestClient";

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("GitHub client updates an existing open pull request instead of creating a duplicate", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    if (init?.method === "GET" && input.includes("/pulls?")) {
      return response(200, [{ html_url: "https://github.com/CoveritLabs/example/pull/7", number: 7 }]);
    }
    if (init?.method === "PATCH" && input.endsWith("/pulls/7")) {
      return response(200, { html_url: "https://github.com/CoveritLabs/example/pull/7", number: 7 });
    }
    throw new Error(`Unexpected request: ${init?.method} ${input}`);
  };

  const client = new GitHubPullRequestClient(fetchImpl);
  const result = await client.upsertPullRequest({
    repositoryUrl: "https://github.com/CoveritLabs/example.git",
    apiKey: "token",
    title: "Updated",
    body: "Body",
    headBranch: "codegen/test",
    baseBranch: "main",
    isDraft: true,
  });

  assert.equal(result.number, 7);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[1].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    title: "Updated",
    body: "Body",
    base: "main",
  });
});

test("GitHub client creates a pull request when no open pull request exists", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    if (init?.method === "GET" && input.includes("/pulls?")) return response(200, []);
    if (init?.method === "GET" && input.includes("/git/ref/heads/codegen/test")) {
      return response(200, { ref: "refs/heads/codegen/test" });
    }
    if (init?.method === "POST" && input.endsWith("/pulls")) {
      return response(201, { html_url: "https://github.com/CoveritLabs/example/pull/8", number: 8 });
    }
    throw new Error(`Unexpected request: ${init?.method} ${input}`);
  };

  const client = new GitHubPullRequestClient(fetchImpl);
  const result = await client.upsertPullRequest({
    repositoryUrl: "https://github.com/CoveritLabs/example.git",
    apiKey: "token",
    title: "Created",
    body: "Body",
    headBranch: "codegen/test",
    baseBranch: "main",
    isDraft: true,
  });

  assert.equal(result.number, 8);
  assert.equal(calls.map((call) => call.init?.method).join(","), "GET,GET,POST");
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), {
    title: "Created",
    body: "Body",
    head: "codegen/test",
    base: "main",
    draft: true,
  });
});

test("GitHub client accepts repository URLs with optional .git and trailing slash", async () => {
  const repositoryUrls = [
    "https://github.com/CoveritLabs/example",
    "https://github.com/CoveritLabs/example/",
    "https://github.com/CoveritLabs/example.git",
    "https://github.com/CoveritLabs/example.git/",
  ];

  for (const repositoryUrl of repositoryUrls) {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });
      if (init?.method === "GET" && input.includes("/pulls?")) {
        return response(200, [{ html_url: "https://github.com/CoveritLabs/example/pull/7", number: 7 }]);
      }
      if (init?.method === "PATCH" && input.endsWith("/pulls/7")) {
        return response(200, { html_url: "https://github.com/CoveritLabs/example/pull/7", number: 7 });
      }
      throw new Error(`Unexpected request for ${repositoryUrl}: ${init?.method} ${input}`);
    };

    const client = new GitHubPullRequestClient(fetchImpl);
    const result = await client.upsertPullRequest({
      repositoryUrl,
      apiKey: "token",
      title: "Updated",
      body: "Body",
      headBranch: "codegen/test",
      baseBranch: "main",
      isDraft: true,
    });

    assert.equal(result.number, 7);
    assert.ok(calls[0].input.startsWith("https://api.github.com/repos/CoveritLabs/example/pulls?"));
    assert.equal(calls[1].input, "https://api.github.com/repos/CoveritLabs/example/pulls/7");
  }
});
