// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], cwd?: string): Promise<CommandResult>;
}

export class ProcessCommandRunner implements CommandRunner {
  async run(command: string, args: string[], cwd?: string): Promise<CommandResult> {
    const result = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}
