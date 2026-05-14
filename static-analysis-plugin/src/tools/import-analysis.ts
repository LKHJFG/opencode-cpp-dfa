import { readFileSync, existsSync } from "fs"
import { relative, resolve, dirname } from "path"

/**
 * Parse import/export statements from TypeScript/JavaScript source.
 * Uses regex parsing (not full AST) — covers ~95% of real-world patterns.
 */

export interface ImportInfo {
  type: "import" | "export" | "reexport"
  source?: string          // module path for imports/reexports
  specifiers: string[]     // imported/exported names
  defaultSpecifier?: string // default import/export name
  isTypeOnly: boolean
  line: number
}

export interface ExportInfo {
  name: string
  line: number
  isDefault: boolean
  isTypeExport: boolean
}

export interface ImportAnalysisResult {
  imports: ImportInfo[]
  exports: ExportInfo[]
  externalDependencies: string[]      // npm packages (not relative paths)
  internalDependencies: string[]      // relative path imports
  unresolvedImports: string[]         // imports whose target files don't exist
  circularDependencies: Array<{ from: string; to: string }>
  summary: string
}

/**
 * Parse all import/export statements from source code.
 */
export function analyzeImports(
  content: string,
  filePath: string,
  projectRoot: string,
): ImportAnalysisResult {
  const lines = content.split("\n")
  const imports: ImportInfo[] = []
  const exports: ExportInfo[] = []
  const externalDeps = new Set<string>()
  const internalDeps = new Set<string>()
  const unresolved: string[] = []
  const circular: Array<{ from: string; to: string }> = []

  // Regex patterns for various import/export forms
  const patterns = [
    // import { x, y } from "module"
    /^import\s+{([^}]+)}\s+from\s+["']([^"']+)["']/,
    // import x from "module"
    /^import\s+(\w+)\s+from\s+["']([^"']+)["']/,
    // import * as x from "module"
    /^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/,
    // import "module" (side-effect)
    /^import\s+["']([^"']+)["']/,
    // import type { x } from "module"
    /^import\s+type\s+{([^}]+)}\s+from\s+["']([^"']+)["']/,
    // import type x from "module"
    /^import\s+type\s+(\w+)\s+from\s+["']([^"']+)["']/,
    // export { x, y } from "module" (re-export)
    /^export\s+{([^}]+)}\s+from\s+["']([^"']+)["']/,
    // export { x, y }
    /^export\s+{([^}]+)}/,
    // export default ...
    /^export\s+default\s+(?:function|class|const|let|var|async)\s+(\w+)/,
    // export default <expression>
    /^export\s+default\s+(?!function|class|const|let|var|async)/,
    // export function x
    /^export\s+(?:function|const|let|var|class|interface|type|async\s+function)\s+(\w+)/,
    // export type x = ...
    /^export\s+type\s+(\w+)\s*=/,
    // export interface x
    /^export\s+interface\s+(\w+)/,
    // export enum x
    /^export\s+enum\s+(\w+)/,
    // export class x
    /^export\s+(?:abstract\s+)?class\s+(\w+)/,
  ]

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]!

    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue

    // Handle multi-line imports (accumulate until braces/parens are balanced)
    let combinedLine = line
    let j = i
    function countChar(s: string, ch: string): number {
      let count = 0, pos = 0
      while ((pos = s.indexOf(ch, pos)) !== -1) { count++; pos++ }
      return count
    }
    while (
      (countChar(combinedLine, "{") > countChar(combinedLine, "}") ||
       countChar(combinedLine, "(") > countChar(combinedLine, ")")) &&
      j < lines.length - 1
    ) {
      j++
      combinedLine += " " + lines[j]!.trim()
    }

    for (const regex of patterns) {
      const match = combinedLine.match(regex)
      if (!match) continue

      if (regex.source.startsWith("^import\\s+{") && match[1] && match[2]) {
        // import { x, y } from "module"
        const specifiers = match[1].split(",").map(s => s.trim().replace(/\s+as\s+\w+$/, "")).filter(Boolean)
        const source = match[2]
        imports.push({ type: "import", source, specifiers, isTypeOnly: false, line: lineNum })
        categorizeDependency(source, filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith("^import\\s+(\\w+)") && match[1] && match[2]) {
        // import x from "module"
        imports.push({
          type: "import",
          source: match[2],
          specifiers: [],
          defaultSpecifier: match[1],
          isTypeOnly: false,
          line: lineNum,
        })
        categorizeDependency(match[2], filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith("^import\\s+\\*") && match[1] && match[2]) {
        // import * as x from "module"
        imports.push({
          type: "import",
          source: match[2],
          specifiers: [`* as ${match[1]}`],
          isTypeOnly: false,
          line: lineNum,
        })
        categorizeDependency(match[2], filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith('^import\\s+["') && match[1]) {
        // import "module" (side-effect)
        imports.push({ type: "import", source: match[1], specifiers: [], isTypeOnly: false, line: lineNum })
        categorizeDependency(match[1], filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith("^import\\s+type\\s+{") && match[1] && match[2]) {
        // import type { x } from "module"
        const specifiers = match[1].split(",").map(s => s.trim()).filter(Boolean)
        imports.push({ type: "import", source: match[2], specifiers, isTypeOnly: true, line: lineNum })
        categorizeDependency(match[2], filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith("^import\\s+type\\s+(\\w+)") && match[1] && match[2]) {
        // import type x from "module"
        imports.push({
          type: "import", source: match[2], specifiers: [],
          defaultSpecifier: match[1], isTypeOnly: true, line: lineNum,
        })
        categorizeDependency(match[2], filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith("^export\\s+{") && match[1] && match[2]) {
        // export { x, y } from "module" (re-export)
        const specifiers = match[1].split(",").map(s => s.trim()).filter(Boolean)
        imports.push({ type: "reexport", source: match[2], specifiers, isTypeOnly: false, line: lineNum })
        categorizeDependency(match[2], filePath, projectRoot, externalDeps, internalDeps, unresolved, circular)
      } else if (regex.source.startsWith("^export\\s+{") && match[1] && !match[2]) {
        // export { x, y }
        const specifiers = match[1].split(",").map(s => s.trim()).filter(Boolean)
        for (const s of specifiers) {
          exports.push({ name: s, line: lineNum, isDefault: false, isTypeExport: false })
        }
      } else if (regex.source.startsWith("^export\\s+default\\s+(?:function|class|const|let|var|async)\\s+") && match[1]) {
        // export default function x / export default class x
        exports.push({ name: match[1], line: lineNum, isDefault: true, isTypeExport: false })
      } else if (regex.source.startsWith("^export\\s+default\\s+(?!function|class|const|let|var|async)")) {
        // export default <expression> (anonymous default export)
        exports.push({ name: "default", line: lineNum, isDefault: true, isTypeExport: false })
      } else if (regex.source.startsWith("^export\\s+(?:function|const|let|var|class|interface|type|async") && match[1]) {
        // export function x, export const x, export class x, etc.
        exports.push({ name: match[1], line: lineNum, isDefault: false, isTypeExport: false })
      } else if (regex.source.startsWith("^export\\s+type") && match[1]) {
        exports.push({ name: match[1], line: lineNum, isDefault: false, isTypeExport: true })
      } else if (regex.source.startsWith("^export\\s+interface") && match[1]) {
        exports.push({ name: match[1], line: lineNum, isDefault: false, isTypeExport: true })
      } else if (regex.source.startsWith("^export\\s+enum") && match[1]) {
        exports.push({ name: match[1], line: lineNum, isDefault: false, isTypeExport: false })
      } else if (regex.source.startsWith("^export\\s+(?:abstract\\s+)?class") && match[1]) {
        exports.push({ name: match[1], line: lineNum, isDefault: false, isTypeExport: false })
      }
      break
    }
  }

  const summary = buildSummary(imports, exports, externalDeps, internalDeps, unresolved, filePath)

  return {
    imports,
    exports,
    externalDependencies: [...externalDeps].sort(),
    internalDependencies: [...internalDeps].sort(),
    unresolvedImports: unresolved,
    circularDependencies: circular,
    summary,
  }
}

function categorizeDependency(
  source: string,
  filePath: string,
  projectRoot: string,
  externalDeps: Set<string>,
  internalDeps: Set<string>,
  unresolved: string[],
  circular: Array<{ from: string; to: string }>,
): void {
  // External packages start without "." or "/" (except scoped packages)
  if (!source.startsWith(".") && !source.startsWith("/")) {
    const pkgName = source.startsWith("@")
      ? source.split("/").slice(0, 2).join("/")
      : source.split("/")[0]!
    externalDeps.add(pkgName)
    return
  }

  internalDeps.add(source)

  // Check if the target file exists (for relative imports)
  if (source.startsWith(".")) {
    const dir = dirname(filePath)
    const resolvedSource = resolveSourcePath(dir, source)
    if (resolvedSource && !existsSync(resolvedSource)) {
      unresolved.push(source)
    }
  }
}

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".d.ts"]

function resolveSourcePath(dir: string, source: string): string | null {
  // Try exact path first
  const exact = resolve(dir, source)
  if (existsSync(exact)) return exact

  // Try adding extensions
  for (const ext of TS_EXTENSIONS) {
    const withExt = exact + ext
    if (existsSync(withExt)) return withExt
  }

  // Try index files
  for (const ext of TS_EXTENSIONS) {
    const indexFile = resolve(dir, source, `index${ext}`)
    if (existsSync(indexFile)) return indexFile
  }

  return null
}

function buildSummary(
  imports: ImportInfo[],
  exports: ExportInfo[],
  externalDeps: Set<string>,
  internalDeps: Set<string>,
  unresolved: string[],
  filePath: string,
): string {
  const parts: string[] = []
  parts.push(`File: ${filePath}`)
  parts.push(`Total imports: ${imports.length}`)
  parts.push(`Total exports: ${exports.length}`)
  parts.push(`External dependencies: ${externalDeps.size}`)
  parts.push(`Internal dependencies: ${internalDeps.size}`)

  if (unresolved.length > 0) {
    parts.push(`Unresolved imports: ${unresolved.length}`)
  }

  if (externalDeps.size > 0) {
    parts.push("")
    parts.push("External packages:")
    for (const dep of [...externalDeps].sort()) {
      parts.push(`  ${dep}`)
    }
  }

  if (exports.length > 0) {
    parts.push("")
    parts.push("Exports:")
    for (const exp of exports) {
      const label = exp.isDefault ? "default" : exp.name
      parts.push(`  ${label} (line ${exp.line})`)
    }
  }

  return parts.join("\n")
}

/**
 * Find all potential circular dependencies in a set of analyzed files.
 * Takes a map of file -> analyzed imports.
 */
export function findCircularDependencies(
  analysisMap: Map<string, ImportAnalysisResult>,
): Array<{ chain: string[] }> {
  const circular: Array<{ chain: string[] }> = []
  const visited = new Set<string>()
  const inPath = new Set<string>()

  function dfs(currentFile: string, path: string[]) {
    if (inPath.has(currentFile)) {
      const cycleStart = path.indexOf(currentFile)
      if (cycleStart !== -1) {
        circular.push({ chain: [...path.slice(cycleStart), currentFile] })
      }
      return
    }
    if (visited.has(currentFile)) return

    visited.add(currentFile)
    inPath.add(currentFile)
    path.push(currentFile)

    const analysis = analysisMap.get(currentFile)
    if (analysis) {
      for (const imp of analysis.imports) {
        if (imp.source && imp.source.startsWith(".")) {
          // Resolve to a canonical path
          const dir = dirname(currentFile)
          const resolved = resolveSourcePath(dir, imp.source)
          if (resolved) {
            dfs(resolved, path)
          }
        }
      }
    }

    path.pop()
    inPath.delete(currentFile)
  }

  for (const file of analysisMap.keys()) {
    dfs(file, [])
  }

  return circular
}
