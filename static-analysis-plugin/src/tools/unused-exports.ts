import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { extname, join, relative, resolve, dirname } from "path"
import { analyzeImports, type ExportInfo } from "./import-analysis"

export interface UnusedExport {
  name: string
  file: string
  line: number
  isDefault: boolean
  reason: string  // why it's considered unused
}

export interface UnusedExportsResult {
  unused: UnusedExport[]
  totalExports: number
  totalFiles: number
  summary: string
}

/**
 * Find potentially unused exports across a project.
 *
 * Scans all TypeScript/JavaScript files, collects all exports,
 * then checks if each export is imported by any other file.
 *
 * Limitations:
 * - Dynamic imports (import()) are partially supported
 * - Export used only in the same file are NOT flagged
 * - Config/entry-point exports are always considered "used"
 */
export function findUnusedExports(
  projectDir: string,
  options: {
    excludeDirs?: string[]
    maxFiles?: number
    entryFiles?: string[]
  } = {},
): UnusedExportsResult {
  const {
    excludeDirs = ["node_modules", ".git", "dist", "build", ".cache", "target", "__pycache__"],
    maxFiles = 200,
    entryFiles = [],
  } = options

  // Phase 1: Find all TS/JS source files
  const files = findSourceFiles(projectDir, excludeDirs, maxFiles)
  const fileCount = files.length

  // Phase 2: Analyze each file for exports and import references
  const allExports: Map<string, ExportInfo & { file: string }> = new Map()
  // Track which export names are imported by other files
  const importReferences: Map<string, Set<string>> = new Map() // exportName -> set of importing files
  // Track file-level analysis results
  const fileExports: Map<string, ExportInfo[]> = new Map()

  // Entry file contents for checking self-references
  const fileContents: Map<string, string> = new Map()

  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8")
      fileContents.set(file, content)
      const analysis = analyzeImports(content, file, projectDir)

      fileExports.set(file, analysis.exports)

      // Track what this file imports from internal modules
      for (const imp of analysis.imports) {
        if (imp.source && imp.source.startsWith(".")) {
          // Resolve the import to find which file it targets
          const dir = dirname(file)
          const resolvedTarget = resolveImportTarget(dir, imp.source)
          if (resolvedTarget && existsSync(resolvedTarget)) {
            const canonicalTarget = resolve(resolvedTarget)
            for (const specifier of imp.specifiers) {
              const cleanName = specifier.replace(/\s+as\s+\w+$/, "").trim()
              if (!importReferences.has(cleanName)) {
                importReferences.set(cleanName, new Set())
              }
              importReferences.get(cleanName)!.add(file)
            }
          }
        }
      }

      // Register all exports
      for (const exp of analysis.exports) {
        const key = `${file}:${exp.name}:${exp.isDefault}`
        allExports.set(key, { ...exp, file })
      }
    } catch {
      // Skip files we can't read
    }
  }

  // Phase 3: Mark entry file exports as "used"
  for (const entryFile of entryFiles) {
    const absEntry = resolve(projectDir, entryFile)
    if (fileContents.has(absEntry)) {
      const entryExports = fileExports.get(absEntry) || []
      for (const exp of entryExports) {
        const key = `${absEntry}:${exp.name}:${exp.isDefault}`
        // Remove from unused candidates by marking as used
        allExports.delete(key)
      }
    }
  }

  // Phase 4: Find unused exports
  const unused: UnusedExport[] = []

  for (const [key, exp] of allExports) {
    const exportName = exp.name
    const references = importReferences.get(exportName)

    // Skip default exports (hard to track statically)
    if (exp.isDefault) continue

    // If no other file imports this export, check if it's used in the same file
    if (!references || references.size === 0) {
      // Check if the export is referenced in the same file (self-use)
      const content = fileContents.get(exp.file)
      if (content && !isReferencedInFile(exportName, content, exp.file)) {
        unused.push({
          name: exportName,
          file: exp.file,
          line: exp.line,
          isDefault: false,
          reason: "Not imported by any other module",
        })
      }
    }
  }

  // Phase 5: Build summary
  const summary = buildUnusedSummary(unused, fileCount, allExports.size)

  return {
    unused,
    totalExports: allExports.size + unused.length,
    totalFiles: fileCount,
    summary,
  }
}

function findSourceFiles(
  dir: string,
  excludeDirs: string[],
  maxFiles: number,
  depth = 0,
): string[] {
  if (depth > 8 || maxFiles <= 0) return []
  const results: string[] = []

  try {
    const entries = readdirSync(dir)
    for (const name of entries) {
      if (results.length >= maxFiles) break
      if (name.startsWith(".") || excludeDirs.includes(name)) continue

      const fullPath = join(dir, name)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...findSourceFiles(fullPath, excludeDirs, maxFiles - results.length, depth + 1))
        } else {
          const ext = extname(name).toLowerCase()
          if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"].includes(ext)) {
            results.push(fullPath)
          }
        }
      } catch {
        // Skip unreadable entries
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return results
}

function resolveImportTarget(dir: string, source: string): string | null {
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".d.ts"]

  const exact = resolve(dir, source)
  if (existsSync(exact)) return exact
  for (const ext of exts) { const p = exact + ext; if (existsSync(p)) return p }
  for (const ext of exts) { const p = resolve(dir, source, `index${ext}`); if (existsSync(p)) return p }

  return null
}

/**
 * Check if an export name is referenced within its own file (excluding its own declaration).
 */
function isReferencedInFile(name: string, content: string, filePath: string): boolean {
  // Check for usage of the name (as a variable/function call) excluding the export declaration itself
  const lines = content.split("\n")
  let count = 0
  for (const line of lines) {
    // Skip the export declaration line itself
    if (line.includes(`export`) && line.includes(name)) continue
    // Check for references
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, "g")
    const matches = line.match(regex)
    if (matches) count += matches.length
  }
  return count > 0
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildUnusedSummary(unused: UnusedExport[], totalFiles: number, totalExports: number): string {
  if (unused.length === 0) {
    return `No unused exports found across ${totalFiles} files (${totalExports} exports checked).`
  }

  const parts: string[] = []
  parts.push(`Found ${unused.length} potentially unused exports across ${totalFiles} files:`)
  parts.push("")

  // Group by directory
  const byDir = new Map<string, UnusedExport[]>()
  for (const u of unused) {
    const dir = dirname(u.file)
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir)!.push(u)
  }

  for (const [dir, exports] of byDir) {
    parts.push(`${dir}/`)
    for (const exp of exports) {
      const fileName = exp.file.substring(dir.length + 1)
      parts.push(`  ${fileName}:${exp.line}  ${exp.name}`)
    }
    parts.push("")
  }

  return parts.join("\n")
}
