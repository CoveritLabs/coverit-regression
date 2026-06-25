// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { Pool } from "pg";
import type { PoolConfig } from "pg";

import type { CrawlSessionCodegenContext, CrawlSessionRepository, WorkerCodegenConfig } from "@/types/worker";

interface CrawlSessionCodegenRow {
  session_id: string;
  app_version_id: string;
  base_url_snapshot: string | null;
  session_codegen_config: unknown;
  target_application_id: string;
  target_application_name: string;
  target_application_base_url: string;
  creator_user_id: string;
  creator_email: string;
  creator_name: string;
  regression_codebase_id: string | null;
  framework_name: string | null;
  repository_url: string | null;
  repo_api_key: string | null;
}

interface RegressionCodebaseRow {
  id: string;
  framework_name: string | null;
  repository_url: string | null;
  api_key: string | null;
}

export default class PostgresCrawlSessionRepository implements CrawlSessionRepository {
  private readonly pool: Pool;

  constructor(connectionString: string | undefined = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error("[Worker] DATABASE_URL is required to load crawl session context.");
    this.pool = new Pool(buildPoolConfig(connectionString));
  }

  async findCodegenContext(sessionId: string): Promise<CrawlSessionCodegenContext> {
    const result = await this.pool.query<CrawlSessionCodegenRow>(
      `
        SELECT
          cs.crawl_session_id AS session_id,
          cs.app_version_id AS app_version_id,
          cs.base_url_snapshot AS base_url_snapshot,
          cs.codegen_config AS session_codegen_config,
          ta.id AS target_application_id,
          ta.name AS target_application_name,
          ta.base_url AS target_application_base_url,
          u.id AS creator_user_id,
          u.email AS creator_email,
          u.name AS creator_name,
          rc.id AS regression_codebase_id,
          rc.framework_name AS framework_name,
          rc.repository_url AS repository_url,
          rc.api_key AS repo_api_key
        FROM crawl_sessions cs
        INNER JOIN target_application_versions tav
          ON tav.id = cs.app_version_id
        INNER JOIN target_applications ta
          ON ta.id = tav.target_application_id
        INNER JOIN users u
          ON u.id = cs.creator_user_id
        LEFT JOIN regression_codebases rc
          ON rc.id = cs.regression_codebase_id
        WHERE cs.crawl_session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`[Worker] Crawl session was not found: ${sessionId}`);

    return {
      sessionId: row.session_id,
      appVersionId: row.app_version_id,
      baseUrlSnapshot: row.base_url_snapshot ?? undefined,
      sessionCodegenConfig: parseCodegenConfig(row.session_codegen_config),
      targetApplication: {
        id: row.target_application_id,
        name: row.target_application_name,
        baseUrl: row.target_application_base_url,
      },
      creator: {
        id: row.creator_user_id,
        email: row.creator_email,
        name: row.creator_name,
      },
      regressionCodebase: row.regression_codebase_id
        ? {
            id: row.regression_codebase_id,
            frameworkName: row.framework_name ?? undefined,
            repositoryUrl: row.repository_url ?? undefined,
            apiKey: row.repo_api_key ?? undefined,
          }
        : undefined,
    };
  }

  async findRegressionCodebase(
    targetApplicationId: string,
    regressionCodebaseId: string,
  ): Promise<CrawlSessionCodegenContext["regressionCodebase"]> {
    const result = await this.pool.query<RegressionCodebaseRow>(
      `
        SELECT
          id,
          framework_name,
          repository_url,
          api_key
        FROM regression_codebases
        WHERE id = $1
          AND target_application_id = $2
        LIMIT 1
      `,
      [regressionCodebaseId, targetApplicationId],
    );

    const row = result.rows[0];
    if (!row) throw new Error(`[Worker] Regression codebase was not found: ${regressionCodebaseId}`);

    return {
      id: row.id,
      frameworkName: row.framework_name ?? undefined,
      repositoryUrl: row.repository_url ?? undefined,
      apiKey: row.api_key ?? undefined,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function buildPoolConfig(connectionString: string): PoolConfig {
  const sslConnectionString = getUnverifiedSslConnectionString(connectionString);
  if (!sslConnectionString) return { connectionString };
  return {
    connectionString: sslConnectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  };
}

function getUnverifiedSslConnectionString(connectionString: string): string | undefined {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode !== "require" && sslMode !== "no-verify") return undefined;
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseCodegenConfig(value: unknown): WorkerCodegenConfig | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      return parseCodegenConfig(JSON.parse(value));
    } catch {
      throw new Error("[Worker] codegenConfig JSON could not be parsed.");
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("[Worker] codegenConfig must be a JSON object.");
  }
  return value as WorkerCodegenConfig;
}
