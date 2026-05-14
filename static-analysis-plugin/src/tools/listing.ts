import { readdirSync, statSync } from "fs"
import { join, extname } from "path"

export interface FileEntry {
  name: string
  path: string
  type: "file" | "directory"
  size: number
  language: string | null
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TSX",
  ".js": "JavaScript",
  ".jsx": "JSX",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".md": "Markdown",
  ".css": "CSS",
  ".scss": "SCSS",
  ".less": "LESS",
  ".html": "HTML",
  ".py": "Python",
  ".java": "Java",
  ".c": "C",
  ".cpp": "C++",
  ".h": "C/C++ Header",
  ".hpp": "C++ Header",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".sh": "Shell",
  ".bash": "Shell",
  ".ps1": "PowerShell",
  ".sql": "SQL",
  ".xml": "XML",
  ".toml": "TOML",
  ".zig": "Zig",
  ".vue": "Vue",
}

export function detectLanguage(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_LANGUAGE_MAP[ext] ?? null
}

export interface ListDirOptions {
  maxDepth?: number
  includeHidden?: boolean
  filterExtensions?: string[]
}

/**
 * List source files in a directory (non-recursive by default).
 */
export function listSourceFiles(
  dirPath: string,
  options: ListDirOptions = {},
): { files: FileEntry[]; error?: string } {
  const { maxDepth = 1, includeHidden = false, filterExtensions } = options

  try {
    const entries = readdirSync(dirPath)
    const files: FileEntry[] = []

    for (const name of entries) {
      // Skip hidden files unless explicitly included
      if (!includeHidden && name.startsWith(".")) continue
      // Skip node_modules
      if (name === "node_modules") continue

      const fullPath = join(dirPath, name)
      try {
        const stats = statSync(fullPath)
        const isDir = stats.isDirectory()
        const language = isDir ? null : detectLanguage(name)

        // Apply extension filter if specified
        if (!isDir && filterExtensions && filterExtensions.length > 0) {
          const ext = extname(name).toLowerCase()
          if (!filterExtensions.includes(ext)) continue
        }

        files.push({
          name,
          path: fullPath,
          type: isDir ? "directory" : "file",
          size: stats.size,
          language,
        })
      } catch {
        // Skip files we can't stat
        continue
      }
    }

    // Sort: directories first, then by name
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return { files }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { files: [], error: message }
  }
}

export interface CodeStats {
  totalFiles: number
  totalDirs: number
  totalSize: number
  byLanguage: Record<string, { count: number; size: number }>
}

/**
 * Get code statistics for a directory (recursive).
 */
export function getCodeStats(dirPath: string, maxFiles: number = 500): CodeStats {
  const stats: CodeStats = {
    totalFiles: 0,
    totalDirs: 0,
    totalSize: 0,
    byLanguage: {},
  }

  function walk(currentPath: string, depth: number) {
    if (depth > 5 || stats.totalFiles > maxFiles) return

    try {
      const entries = readdirSync(currentPath)
      for (const name of entries) {
        if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue

        const fullPath = join(currentPath, name)
        try {
          const s = statSync(fullPath)
          if (s.isDirectory()) {
            stats.totalDirs++
            walk(fullPath, depth + 1)
          } else {
            stats.totalFiles++
            stats.totalSize += s.size
            const lang = detectLanguage(name)
            if (lang) {
              if (!stats.byLanguage[lang]) stats.byLanguage[lang] = { count: 0, size: 0 }
              stats.byLanguage[lang]!.count++
              stats.byLanguage[lang]!.size += s.size
            }
          }
        } catch {
          // Skip unreadable entries
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(dirPath, 1)
  return stats
}
