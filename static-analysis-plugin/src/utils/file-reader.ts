import { readFileSync, existsSync } from "fs"
import { isAbsolute, join, resolve } from "path"

/**
 * Read a file from disk.
 * @throws If file does not exist or cannot be read
 */
export function readFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  try {
    return readFileSync(filePath, "utf-8")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot read file ${filePath}: ${message}`)
  }
}

/**
 * Resolve a file path against a base directory.
 * If the path is already absolute, return as-is.
 */
export function resolvePath(filePath: string, baseDir: string): string {
  if (isAbsolute(filePath)) {
    return filePath
  }
  return resolve(join(baseDir, filePath))
}
