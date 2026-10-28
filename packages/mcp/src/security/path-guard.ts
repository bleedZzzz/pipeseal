import fs from "node:fs";
import path from "node:path";

export class PathSecurityError extends Error {
  constructor(
    message: string,
    public readonly requestedPath: string,
  ) {
    super(message);
    this.name = "PathSecurityError";
  }
}

export interface PathGuardOptions {
  trustedRoot?: string;
}

export class PathGuard {
  private readonly trustedRoot: string;

  constructor(options: PathGuardOptions = {}) {
    const rawRoot = options.trustedRoot ?? process.cwd();
    const resolvedRoot = path.resolve(rawRoot);
    if (fs.existsSync(resolvedRoot)) {
      this.trustedRoot = fs.realpathSync(resolvedRoot);
    } else {
      this.trustedRoot = path.normalize(resolvedRoot);
    }
  }

  getTrustedRoot(): string {
    return this.trustedRoot;
  }

  /**
   * Resolves and canonicalizes a user-supplied path, guaranteeing that the target
   * resides strictly inside the trusted project root without traversal or symlink escapes.
   */
  resolveAndValidate(userPath: string, basePath?: string): string {
    if (!userPath || typeof userPath !== "string") {
      throw new PathSecurityError(
        "Path must be a non-empty string",
        String(userPath),
      );
    }

    if (userPath.includes("\0")) {
      throw new PathSecurityError(
        "Path contains forbidden null byte characters",
        userPath,
      );
    }

    // Determine the base resolution directory
    const effectiveBase = basePath
      ? this.resolveAndValidate(basePath)
      : this.trustedRoot;

    // Resolve candidate path
    const candidatePath = path.isAbsolute(userPath)
      ? path.normalize(userPath)
      : path.resolve(effectiveBase, userPath);

    // Canonicalize file and follow symlinks
    let realCandidate: string;
    try {
      if (fs.existsSync(candidatePath)) {
        realCandidate = fs.realpathSync(candidatePath);
      } else {
        // If file doesn't exist, canonicalize the closest existing ancestor
        let current = path.dirname(candidatePath);
        const segments: string[] = [path.basename(candidatePath)];

        while (
          current &&
          !fs.existsSync(current) &&
          current !== path.dirname(current)
        ) {
          segments.unshift(path.basename(current));
          current = path.dirname(current);
        }

        if (fs.existsSync(current)) {
          const realParent = fs.realpathSync(current);
          realCandidate = path.join(realParent, ...segments);
        } else {
          realCandidate = candidatePath;
        }
      }
    } catch (err) {
      throw new PathSecurityError(
        `Failed to resolve path '${userPath}': ${err instanceof Error ? err.message : String(err)}`,
        userPath,
      );
    }

    // Verify whether realCandidate is strictly inside this.trustedRoot
    const relativeToRoot = path.relative(this.trustedRoot, realCandidate);
    const escapes =
      relativeToRoot.startsWith("..") ||
      path.isAbsolute(relativeToRoot) ||
      relativeToRoot === ".." ||
      (process.platform === "win32" &&
        path.parse(this.trustedRoot).root.toLowerCase() !==
          path.parse(realCandidate).root.toLowerCase());

    if (escapes) {
      throw new PathSecurityError(
        `Access denied: path '${userPath}' resolves outside trusted project root`,
        userPath,
      );
    }

    return realCandidate;
  }

  /**
   * Return a sanitized path relative to trusted root suitable for safe diagnostic reporting.
   */
  toRelativeSafePath(absoluteOrResolvedPath: string): string {
    try {
      const rel = path.relative(this.trustedRoot, absoluteOrResolvedPath);
      return rel ? rel.replace(/\\/g, "/") : ".";
    } catch {
      return path.basename(absoluteOrResolvedPath);
    }
  }
}
