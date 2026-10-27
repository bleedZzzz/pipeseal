import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function computeHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return computeHash(buffer);
}
