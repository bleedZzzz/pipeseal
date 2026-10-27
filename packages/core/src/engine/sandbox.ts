import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, extname } from "node:path";
import { ExecutionError } from "../errors.js";

export interface StagedFile {
  originalPath: string;
  stagedPath: string;
  sanitizedName: string;
}

export class StagingManager {
  private stagingDir: string | null = null;
  private readonly stagedFiles = new Map<string, StagedFile>();

  async initialize(): Promise<string> {
    try {
      this.stagingDir = await mkdtemp(join(tmpdir(), "pipeseal-stage-"));
      return this.stagingDir;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ExecutionError(
        `Failed to create staging directory: ${msg}`,
        err,
      );
    }
  }

  get directory(): string {
    if (!this.stagingDir) {
      throw new ExecutionError("StagingManager has not been initialized");
    }
    return this.stagingDir;
  }

  async stageFile(sourcePath: string, targetName: string): Promise<StagedFile> {
    if (!this.stagingDir) {
      throw new ExecutionError("StagingManager has not been initialized");
    }

    const ext = extname(sourcePath);
    // Sanitize target name to prevent directory traversal
    const safeBase = basename(targetName).replace(/[^a-zA-Z0-9_-]/g, "_");
    const stagedName = `${safeBase}${ext}`;
    const stagedPath = join(this.stagingDir, stagedName);

    try {
      await copyFile(sourcePath, stagedPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ExecutionError(
        `Failed to stage fixture file "${sourcePath}": ${msg}`,
        err,
      );
    }

    const staged: StagedFile = {
      originalPath: sourcePath,
      stagedPath,
      sanitizedName: stagedName,
    };
    this.stagedFiles.set(targetName, staged);
    return staged;
  }

  async cleanup(): Promise<void> {
    if (this.stagingDir) {
      try {
        await rm(this.stagingDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure to prevent masking primary errors
      } finally {
        this.stagingDir = null;
        this.stagedFiles.clear();
      }
    }
  }
}
