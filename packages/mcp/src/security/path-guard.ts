import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function findDefaultProjectRoot(): string {
  if (process.env.PIPESEAL_PROJECT_ROOT) {
    return path.resolve(process.env.PIPESEAL_PROJECT_ROOT);
  }
  const cwd = process.cwd();
  if (
    fs.existsSync(path.join(cwd, "pnpm-workspace.yaml")) ||
    fs.existsSync(path.join(cwd, ".git")) ||
    fs.existsSync(path.join(cwd, "pipeseal.verify.yml")) ||
    fs.existsSync(path.join(cwd, "pipeseal.verify.yaml"))
  ) {
    return cwd;
  }

  // Walk up from cwd looking for a project root (e.g. if spawned inside a project subfolder)
  try {
    let current = cwd;
    while (current && current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, "pipeseal.verify.yml")) ||
        fs.existsSync(path.join(current, "pipeseal.verify.yaml")) ||
        fs.existsSync(path.join(current, ".git"))
      ) {
        return current;
      }
      current = path.dirname(current);
    }
  } catch {
    // Continue
  }

  // If cwd is an external host application directory (e.g. IDE installation folder),
  // walk up from this module's location only if inside a development checkout
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    while (dir && dir !== path.dirname(dir)) {
      if (
        fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
        fs.existsSync(path.join(dir, ".git"))
      ) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fall back to cwd
  }
  return cwd;
}

export class PathGuard {
  private readonly trustedRoot: string;

  constructor(options: PathGuardOptions = {}) {
    const rawRoot = options.trustedRoot ?? findDefaultProjectRoot();
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
