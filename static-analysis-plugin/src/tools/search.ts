import { readFileSync } from "fs"
import { join } from "path"
import { readdirSync, statSync } from "fs"

export interface SearchMatch {
  file: string
  line: number
  column: number
  content: string
}

export interface SearchOptions {
  pattern: string
  caseSensitive?: boolean
  maxResults?: number
  includePattern?: string[] // file extensions to include
  excludeDirs?: string[]
}

/**
 * Search for a pattern in source files within a directory.
 */
export function grepSource(
  dirPath: string,
  options: SearchOptions,
): { matches: SearchMatch[]; totalFiles: number; error?: string } {
  const {
    pattern,
    caseSensitive = false,
    maxResults = 50,
    includePattern = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".cpp", ".c", ".h", ".rb", ".php"],
    excludeDirs = ["node_modules", ".git", "dist", "build", ".cache"],
  } = options

  const matches: SearchMatch[] = []
  let totalFiles = 0
  let foundCount = 0

  function walk(currentPath: string, depth: number) {
    if (depth > 8 || foundCount >= maxResults) return

    try {
      const entries = readdirSync(currentPath)
      for (const name of entries) {
        if (foundCount >= maxResults) return
        if (name.startsWith(".") || excludeDirs.includes(name)) continue

        const fullPath = join(currentPath, name)
        try {
          const s = statSync(fullPath)
          if (s.isDirectory()) {
            walk(fullPath, depth + 1)
          } else {
            const ext = name.includes(".") ? "." + name.split(".").pop()!.toLowerCase() : ""
            if (includePattern.length === 0 || includePattern.includes(ext)) {
              totalFiles++
              try {
                const content = readFileSync(fullPath, "utf-8")
                const lines = content.split("\n")
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i]!
                  const searchContent = caseSensitive ? line : line.toLowerCase()
                  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase()
                  const col = searchContent.indexOf(searchPattern)
                  if (col !== -1) {
                    matches.push({
                      file: fullPath,
                      line: i + 1,
                      column: col + 1,
                      content: line.trim().substring(0, 200),
                    })
                    foundCount++
                    if (foundCount >= maxResults) return
                  }
                }
              } catch {
                // Skip unreadable files
              }
            }
          }
        } catch {
          // Skip entries we can't stat
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(dirPath, 1)
  return { matches, totalFiles }
}
