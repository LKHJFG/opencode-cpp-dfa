import { type Plugin, tool } from "@opencode-ai/plugin"
import { readFile, resolvePath } from "./utils/file-reader"
import { analyzeSource } from "./tools/analyze"
import { listSourceFiles, getCodeStats, detectLanguage } from "./tools/listing"
import { grepSource } from "./tools/search"
import { analyzeImports } from "./tools/import-analysis"
import { findUnusedExports } from "./tools/unused-exports"
import { analyzeComplexity } from "./tools/complexity"
import { createVariableTraceTool } from "./tools/cpp/variable-trace"

/**
 * Static Analysis Plugin for OpenCode
 *
 * Provides source code analysis tools:
 * - analyze_file: Deep analysis of a single source file
 * - list_source_files: List source files in a directory
 * - grep_source: Search for patterns in source code
 * - code_stats: Get code statistics for a project
 * - analyze_imports: Import/export dependency analysis
 * - find_unused_exports: Cross-file unused export detection
 * - analyze_complexity: Cyclomatic complexity and function metrics
 * - trace_variable: C++ variable data flow tracing (forward/backward)
 *
 * Also hooks into session events to provide automatic analysis.
 */
const StaticAnalysisPlugin: Plugin = async (ctx) => {
  // Store tools reference for use in hooks
  const tools = {
    analyze_file: tool({
      description:
        "Deep analysis of a single source file. Returns file stats, TODO/FIXME/HACK comment detection, " +
        "long line warnings (>120 chars), trailing whitespace, and long function/block detection. " +
        "Use this when you need to audit code quality in a specific file before making changes.",
      args: {
        filePath: tool.schema
          .string()
          .describe("Path to the file to analyze (absolute or relative to workspace)"),
      },
      async execute(args, context) {
        try {
          const absPath = resolvePath(args.filePath, context.directory)
          const content = readFile(absPath)
          const result = analyzeSource(content, absPath)
          return {
            output: result.summary,
            metadata: {
              filePath: absPath,
              lineCount: result.lineCount,
              findingCount: result.findings.length,
              findings: result.findings,
              language: detectLanguage(absPath),
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error analyzing file: ${message}`,
            metadata: { error: message, filePath: args.filePath },
          }
        }
      },
    }),

    list_source_files: tool({
      description:
        "List source files in a directory. Returns file names, types (file/directory), sizes, and detected languages. " +
        "Supports 30+ programming languages. Use this to explore project structure before diving into specific files.",
      args: {
        directory: tool.schema
          .string()
          .describe("Directory path to list (absolute or relative to workspace)"),
        includeHidden: tool.schema
          .boolean()
          .optional()
          .describe("Include hidden files (default: false)"),
      },
      async execute(args, context) {
        try {
          const absPath = resolvePath(args.directory, context.directory)
          const { files, error } = listSourceFiles(absPath, {
            includeHidden: args.includeHidden ?? false,
          })

          if (error) {
            return {
              output: `Error listing directory: ${error}`,
              metadata: { error, directory: absPath },
            }
          }

          const fileList = files
            .map(f =>
              `${f.type === "directory" ? "📁" : "📄"} ${f.name}${f.language ? ` (${f.language})` : ""} [${formatSize(f.size)}]`
            )
            .join("\n")

          const totalFiles = files.filter(f => f.type === "file").length
          const totalDirs = files.filter(f => f.type === "directory").length

          return {
            output: [
              `Directory: ${absPath}`,
              `Total: ${files.length} entries (${totalDirs} dirs, ${totalFiles} files)`,
              "",
              fileList,
            ].join("\n"),
            metadata: {
              directory: absPath,
              totalEntries: files.length,
              totalFiles,
              totalDirs,
              files: files.slice(0, 200),
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error listing directory: ${message}`,
            metadata: { error: message, directory: args.directory },
          }
        }
      },
    }),

    grep_source: tool({
      description:
        "Search for a text pattern in source files. Returns file paths, line numbers, and matching content. " +
        "Supports case-sensitive/insensitive search and file type filtering. " +
        "Use this to find function definitions, imports, variable usages, TODOs, or any text pattern across your codebase.",
      args: {
        pattern: tool.schema
          .string()
          .describe("Text pattern to search for (case-insensitive by default)"),
        directory: tool.schema
          .string()
          .optional()
          .describe("Directory to search in (defaults to workspace root)"),
        caseSensitive: tool.schema
          .boolean()
          .optional()
          .describe("Enable case-sensitive search (default: false)"),
        maxResults: tool.schema
          .number()
          .optional()
          .describe("Maximum number of results (default: 50, max: 200)"),
        fileTypes: tool.schema
          .string()
          .optional()
          .describe("Comma-separated file extensions to search, e.g. '.ts,.js,.tsx' (default: common source extensions)"),
      },
      async execute(args, context) {
        try {
          const searchDir = resolvePath(args.directory ?? ".", context.directory)
          const excludeDirs = ["node_modules", ".git", "dist", "build", ".cache", "target", "venv", "__pycache__"]

          const types = args.fileTypes
            ? args.fileTypes.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
            : []

          const { matches, totalFiles, error } = grepSource(searchDir, {
            pattern: args.pattern,
            caseSensitive: args.caseSensitive ?? false,
            maxResults: Math.min(args.maxResults ?? 50, 200),
            includePattern: types.length > 0 ? types : [],
            excludeDirs,
          })

          if (error) {
            return {
              output: `Error searching: ${error}`,
              metadata: { error },
            }
          }

          if (matches.length === 0) {
            return {
              output: `No matches found for "${args.pattern}" in ${searchDir} (searched ${totalFiles} files)`,
              metadata: { pattern: args.pattern, totalFilesSearched: totalFiles, matchCount: 0 },
            }
          }

          const matchLines = matches
            .slice(0, 100)
            .map(m => `${m.file}:${m.line}:${m.column}  ${m.content}`)
            .join("\n")

          const summary = matches.length >= (args.maxResults ?? 50)
            ? `Found ${matches.length}+ matches (truncated). Searched ${totalFiles} files.`
            : `Found ${matches.length} matches in ${totalFiles} files.`

          return {
            output: [
              `Search results for "${args.pattern}" in ${searchDir}`,
              summary,
              "",
              matchLines,
            ].join("\n"),
            metadata: {
              pattern: args.pattern,
              directory: searchDir,
              totalFilesSearched: totalFiles,
              matchCount: matches.length,
              matches: matches.slice(0, 200),
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error searching source: ${message}`,
            metadata: { error: message },
          }
        }
      },
    }),

    code_stats: tool({
      description:
        "Get code statistics for a project directory. Returns total files, directories, size, and breakdown by programming language. " +
        "Use this to understand project composition, size, and language distribution before doing detailed analysis.",
      args: {
        directory: tool.schema
          .string()
          .optional()
          .describe("Project directory to analyze (defaults to workspace root)"),
      },
      async execute(args, context) {
        try {
          const absPath = resolvePath(args.directory ?? ".", context.directory)
          const stats = getCodeStats(absPath)

          const langBreakdown = Object.entries(stats.byLanguage)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([lang, info]) =>
              `  ${lang}: ${info.count} files, ${formatSize(info.size)}`
            )
            .join("\n")

          return {
            output: [
              `Code Statistics for: ${absPath}`,
              `─────────────────────────────────`,
              `Total files:     ${stats.totalFiles}`,
              `Total dirs:      ${stats.totalDirs}`,
              `Total size:      ${formatSize(stats.totalSize)}`,
              `Languages found: ${Object.keys(stats.byLanguage).length}`,
              "",
              "Breakdown by language:",
              langBreakdown || "  (no recognized source files found)",
            ].join("\n"),
            metadata: {
              directory: absPath,
              totalFiles: stats.totalFiles,
              totalDirs: stats.totalDirs,
              totalSize: stats.totalSize,
              languageCount: Object.keys(stats.byLanguage).length,
              byLanguage: stats.byLanguage,
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error getting code stats: ${message}`,
            metadata: { error: message },
          }
        }
      },
    }),

    analyze_imports: tool({
      description:
        "Analyze import/export dependencies in a source file. Returns parsed import statements, export declarations, " +
        "external npm dependencies, internal relative dependencies, unresolved imports (files that don't exist), " +
        "and circular dependency detection. " +
        "Use this before refactoring code to understand module dependencies and detect potential issues.",
      args: {
        filePath: tool.schema
          .string()
          .describe("Path to the source file to analyze (absolute or relative to workspace)"),
        projectRoot: tool.schema
          .string()
          .optional()
          .describe("Project root for resolving relative imports (defaults to file's parent directory)"),
      },
      async execute(args, context) {
        try {
          const absPath = resolvePath(args.filePath, context.directory)
          const content = readFile(absPath)
          const root = args.projectRoot
            ? resolvePath(args.projectRoot, context.directory)
            : context.directory
          const result = analyzeImports(content, absPath, root)
          return {
            output: result.summary,
            metadata: {
              filePath: absPath,
              importCount: result.imports.length,
              exportCount: result.exports.length,
              externalDependencies: result.externalDependencies,
              internalDependencies: result.internalDependencies,
              unresolvedImports: result.unresolvedImports,
              circularDependencies: result.circularDependencies,
              imports: result.imports,
              exports: result.exports,
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error analyzing imports: ${message}`,
            metadata: { error: message, filePath: args.filePath },
          }
        }
      },
    }),

    find_unused_exports: tool({
      description:
        "Find potentially unused exports across a TypeScript/JavaScript project. Scans all source files, " +
        "collects all exports, then checks if each export is imported by any other file. " +
        "Entry point files and config files are automatically excluded. " +
        "Use this to clean up dead code and reduce bundle size before a release.",
      args: {
        directory: tool.schema
          .string()
          .optional()
          .describe("Project directory to scan (defaults to workspace root)"),
        excludeDirs: tool.schema
          .string()
          .optional()
          .describe("Comma-separated directory names to exclude (default: node_modules,.git,dist,build,.cache,target,__pycache__)"),
        entryFiles: tool.schema
          .string()
          .optional()
          .describe("Comma-separated entry file paths to always consider as 'used'"),
      },
      async execute(args, context) {
        try {
          const absPath = resolvePath(args.directory ?? ".", context.directory)
          const excludeList = args.excludeDirs
            ? args.excludeDirs.split(",").map(d => d.trim()).filter(Boolean)
            : undefined
          const entryList = args.entryFiles
            ? args.entryFiles.split(",").map(f => f.trim()).filter(Boolean)
            : undefined
          const result = findUnusedExports(absPath, {
            excludeDirs: excludeList,
            entryFiles: entryList,
          })
          return {
            output: result.summary,
            metadata: {
              directory: absPath,
              totalExports: result.totalExports,
              totalFiles: result.totalFiles,
              unusedCount: result.unused.length,
              unused: result.unused,
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error finding unused exports: ${message}`,
            metadata: { error: message, directory: args.directory },
          }
        }
      },
    }),

    analyze_complexity: tool({
      description:
        "Analyze cyclomatic complexity and function metrics for a source file. Returns per-function analysis " +
        "(name, line count, parameter count, cyclomatic complexity, nesting depth, return count), " +
        "average complexity, and an overall maintainability score. " +
        "Use this to identify complex functions that may need refactoring.",
      args: {
        filePath: tool.schema
          .string()
          .describe("Path to the source file to analyze (absolute or relative to workspace)"),
      },
      async execute(args, context) {
        try {
          const absPath = resolvePath(args.filePath, context.directory)
          const content = readFile(absPath)
          const result = analyzeComplexity(content, absPath)
          return {
            output: result.fileSummary,
            metadata: {
              filePath: absPath,
              functions: result.functions,
              functionCount: result.functionCount,
              averageComplexity: result.averageComplexity,
              highestComplexity: result.highestComplexity,
              overallScore: result.overallScore,
            },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            output: `Error analyzing complexity: ${message}`,
            metadata: { error: message, filePath: args.filePath },
          }
        }
      },
    }),

    trace_variable: createVariableTraceTool(),
  }

  return {
    tool: tools,

    // Auto-trigger code analysis when a chat message is received
    // This helps the LLM discover and use the available tools
    "chat.params": async (_input, output) => {
      // Increase temperature slightly for analytical tasks
      output.temperature = Math.min(output.temperature + 0.1, 1.0)
    },
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default StaticAnalysisPlugin
