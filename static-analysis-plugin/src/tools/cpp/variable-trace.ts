/**
 * Variable Trace Tool for OpenCode Plugin
 *
 * Combines C++ parsing, CFG construction, and data flow analysis
 * into a single tool that traces variable flow forward/backward.
 *
 * v1: Line-scan based (no tree-sitter dependency for basic cases).
 * v2+: Will integrate with tree-sitter AST for better accuracy.
 */

import { tool } from "@opencode-ai/plugin"
import { readFile, resolvePath } from "../../utils/file-reader"
import { buildCFG } from "./cpp-cfg"
import { buildDefUseChains, analyzeDataFlow, type FlowEdge } from "./cpp-dataflow"
import { CppParser } from "./cpp-parser"
import { buildFunctionCFGs, buildCallGraph, traceInterprocedural, type FunctionCFG } from "./cross-function-dfa"

let buildASTCFG: ((tree: any, sourceLines: string[]) => any) | null = null

async function getAstToCfg(): Promise<typeof import("./ast-to-cfg")> {
  if (!buildASTCFG) {
    try {
      const mod = await import("./ast-to-cfg")
      buildASTCFG = mod.buildASTCFG
    } catch {
      buildASTCFG = null
    }
  }
  return buildASTCFG as any
}

export interface VariableTraceArgs {
  filePath: string
  variableName: string
  line?: number
  direction?: "forward" | "backward" | "both"
  directory?: string
  maxDepth?: number
}

export interface VariableTraceMeta {
  variableName: string
  direction: string
  filePath: string
  edges: FlowEdge[]
  allVariables: string[]
}

/**
 * Create the trace_variable tool definition.
 */
export function createVariableTraceTool(): any {
  return tool({
    description:
      "Trace a variable through C++ source code using data flow analysis. " +
      "Given a variable name and position, finds all variables this variable flows to (forward) " +
      "or all variables that flow into it (backward). Supports cross-function/interprocedural tracing " +
      "when multiple functions are present. Handles basic types, pointers, structs, arrays, and function calls. " +
      "When 'directory' is provided, performs cross-file analysis by scanning all .cpp/.h/.hpp files in the workspace.",
    args: {
      filePath: tool.schema
        .string()
        .describe("Path to the C++ source file to analyze (absolute or relative to workspace)"),
      variableName: tool.schema.string().describe("Name of the variable to trace"),
      line: tool.schema
        .number()
        .optional()
        .describe("Line number of the variable definition (optional, auto-detected)"),
      direction: tool.schema
        .string()
        .optional()
        .describe("Trace direction: 'forward', 'backward', or 'both' (default: 'both')"),
      directory: tool.schema
        .string()
        .optional()
        .describe("Workspace directory for cross-file analysis. Scans .cpp/.h/.hpp files for interprocedural tracing"),
      maxDepth: tool.schema
        .number()
        .optional()
        .describe("Maximum trace depth for cross-file analysis (default: 3)"),
    },
    async execute(
      args: { filePath: string; variableName: string; line?: number; direction?: string; directory?: string; maxDepth?: number },
      context: any,
    ) {
      try {
        const absPath = resolvePath(args.filePath, context.directory)
        const content = readFile(absPath)
        const sourceLines = content.split("\n")
        const varName = args.variableName
        const direction = (args.direction ?? "both") as "forward" | "backward" | "both"
        let startLine = args.line

        // Auto-detect variable line if not provided
        if (startLine === undefined) {
            startLine = findVariableLine(sourceLines, varName)
        }

        let result: { edges: FlowEdge[]; allVariables: string[]; summary: string } | undefined = undefined

        // v4: Cross-file DFA (when directory is provided)
        if (args.directory) {
          try {
            const { analyzeWorkspace, traceCrossFile } = await import("./cross-file-dfa")
            const workspace = await analyzeWorkspace(args.directory)
            const xfResult = await traceCrossFile(varName, absPath, direction, workspace, args.maxDepth)
            for (const edge of xfResult.edges) {
              if (!edge.fromFile) edge.fromFile = absPath
              if (!edge.toFile) edge.toFile = absPath
            }
            result = xfResult
          } catch (xfErr) {
            console.error("Cross-file analysis failed, falling back:", xfErr)
          }
        }

        // Only run v3→v2→v1 if result wasn't set by v4
        if (!result) {
        // Try v3 interprocedural (cross-function) DFA first
        try {
          const parser = CppParser.getInstance()
          const parserResult = await parser.parseContent(content, absPath)
          const tree = parserResult.tree

          // Build per-function CFGs
          const funcCfgs = buildFunctionCFGs(tree, sourceLines, absPath)

          if (funcCfgs.size > 1) {
            // Multiple functions — use interprocedural trace
            const callSites = buildCallGraph(tree, funcCfgs)
            // Find which function contains startVar
            const startFunc = findFunctionForVariable(funcCfgs, varName, startLine) ?? findMainFunction(funcCfgs)

            const ipResult = traceInterprocedural(
              funcCfgs, callSites, varName, startFunc, direction, absPath, args.maxDepth ?? 3,
            )

            // Set file paths on edges
            for (const edge of ipResult.edges) {
              edge.fromFile = absPath
              edge.toFile = absPath
            }

          result = ipResult
        } else {
          // Single function — use existing v2 AST-based path
          const funcCfg = funcCfgs.values().next().value
          if (funcCfg) {
            const duInfo = funcCfg.duInfo
            const cfg = funcCfg.cfg
            const intraResult = analyzeDataFlow(cfg, duInfo, varName, startLine, direction, absPath)
            for (const edge of intraResult.edges) {
              edge.fromFile = absPath; edge.toFile = absPath
            }
            result = intraResult
          } else {
            throw new Error("No functions found")
          }
        }
          } catch {
            // v2 fallback: AST-based single function
          try {
            const astToCfgModule = await getAstToCfg()
            if (astToCfgModule && astToCfgModule.buildASTCFG) {
              const parser = CppParser.getInstance()
              const parserResult = await parser.parseContent(content, absPath)
              const cfg = astToCfgModule.buildASTCFG(parserResult.tree, parserResult.sourceLines)
              const duInfo = buildDefUseChains(cfg, absPath)
              const intraResult = analyzeDataFlow(cfg, duInfo, varName, startLine, direction, absPath)
              for (const edge of intraResult.edges) {
                edge.fromFile = absPath; edge.toFile = absPath
              }
              result = intraResult
            } else {
              throw new Error("AST-to-CFG not available")
            }
          } catch {
            // v1 fallback: line-scan CFG
            const cfg = buildCFG(sourceLines)
            const duInfo = buildDefUseChains(cfg, absPath)
            const intraResult = analyzeDataFlow(cfg, duInfo, varName, startLine, direction, absPath)
            for (const edge of intraResult.edges) {
              edge.fromFile = absPath; edge.toFile = absPath
            }
            result = intraResult
          }
        }
        }

        // Format a nice output
        const output = formatTraceOutput(
          { startVariable: varName, direction, edges: result.edges, allVariables: result.allVariables, summary: result.summary },
          absPath,
        )

        return {
          output,
          metadata: {
            variableName: varName,
            direction,
            filePath: absPath,
            edges: result.edges,
            allVariables: result.allVariables,
          } satisfies VariableTraceMeta,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          output: `Error tracing variable: ${message}`,
          metadata: { error: message, filePath: args.filePath },
        }
      }
    },
  })
}

/**
 * Find the line where a variable is declared or first used.
 */
function findVariableLine(sourceLines: string[], varName: string): number | undefined {
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i]!
    const trimmed = line.trim()

    // Skip comments and empty lines
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed === "") continue

    // Strip inline comments to avoid matching variable names in comments
    const code = trimmed.includes("//") ? trimmed.slice(0, trimmed.indexOf("//")).trim() : trimmed
    if (!code) continue

    // Check for variable declaration with this name
    // Use negative lookahead to avoid matching function parameters like (int x)
    const declPattern = new RegExp(
      `\\b(?:int|float|double|char|bool|auto|string|void|size_t)\\s+\\*?\\s*${escapeRegex(varName)}\\b(?!\\s*[,)])`,
    )
    if (declPattern.test(code)) return i + 1

    // Check for assignment to this variable (not field access like obj.value = ...)
    const assignPattern = new RegExp(
      `(?<!\\.)\\b${escapeRegex(varName)}\\s*[+\\-*/]?=`,
    )
    if (assignPattern.test(code)) return i + 1

    // Check for reference to this variable on RHS (not field access like obj.value)
    const refPattern = new RegExp(
      `=\\s*[^;]*(?<!\\.)\\b${escapeRegex(varName)}\\b`,
    )
    if (refPattern.test(code)) return i + 1
  }
  return undefined
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findFunctionForVariable(funcCfgs: Map<string, FunctionCFG>, varName: string, line?: number): string | null {
  if (line) {
    for (const [name, cfg] of funcCfgs) {
      if (line >= cfg.startLine && line <= cfg.endLine) return name
    }
  }
  // Search by variable name in CFG defs/uses
  for (const [name, cfg] of funcCfgs) {
    if (cfg.duInfo.definitions.has(varName)) return name
    if (cfg.duInfo.uses.has(varName)) return name
  }
  return null
}

function findMainFunction(funcCfgs: Map<string, FunctionCFG>): string {
  if (funcCfgs.has("main")) return "main"
  return funcCfgs.keys().next().value ?? ""
}

/**
 * Format trace output for display.
 */
function formatTraceOutput(
  result: { startVariable: string; direction: string; edges: FlowEdge[]; allVariables: string[]; summary: string },
  filePath: string,
): string {
  const lines: string[] = []
  const { startVariable, direction, edges, allVariables, summary } = result

  lines.push("=".repeat(60))
  lines.push(`Variable Trace: ${startVariable}`)
  lines.push(`File: ${filePath}`)
  lines.push(`Direction: ${direction}`)
  lines.push("=".repeat(60))
  lines.push("")

  if (edges.length === 0) {
    lines.push(`No data flow detected for variable "${startVariable}".`)
    lines.push("")
    lines.push("Possible reasons:")
    lines.push("  - Variable is declared but never used in further assignments")
    lines.push("  - Variable name might be different (check spelling/case)")
    lines.push("  - Variable flow involves patterns not yet supported (pointers, function calls)")
    return lines.join("\n")
  }

  // Group edges by direction
  const forwardEdges = edges.filter((e) => {
    // Forward edges: fromVar is in allVariables and edge goes to a new variable
    return allVariables.indexOf(e.toVar) > allVariables.indexOf(e.fromVar) ||
           (direction !== "backward" && true)
  })

  const backwardEdges = edges.filter((e) => {
    return edges.indexOf(e) >= forwardEdges.length || direction === "backward"
  })

  // Print flow chain
  if (direction === "forward" || direction === "both") {
    lines.push("── Forward Flow ──")
    lines.push(formatChain(edges, startVariable, false))
    lines.push("")
    lines.push("Details:")
    for (const edge of forwardEdges) {
      lines.push(`  ${edge.fromVar} (line ${edge.fromLine})`)
      lines.push(`    ↓ [${edge.edgeType}]`)
      lines.push(`  ${edge.toVar} (line ${edge.toLine}): ${edge.toStatement}`)
    }
    lines.push("")
  }

  if (direction === "backward" || direction === "both") {
    lines.push("── Backward Flow ──")
    lines.push(formatChain(edges, startVariable, true))
    lines.push("")
    lines.push("Details:")
    for (const edge of backwardEdges) {
      lines.push(`  ${edge.toVar} (line ${edge.toLine}): ${edge.toStatement}`)
      lines.push(`    ↑ [${edge.edgeType}] from`)
      lines.push(`  ${edge.fromVar} (line ${edge.fromLine})`)
    }
    lines.push("")
  }

  // Summary
  lines.push("── Summary ──")
  lines.push(`  Variables involved: ${allVariables.join(", ")}`)
  lines.push(`  Flow edges: ${edges.length}`)

  return lines.join("\n")
}

/**
 * Format a simple chain: a → b → c
 */
function formatChain(edges: FlowEdge[], startVar: string, reverse: boolean): string {
  // Build adjacency map
  const adj = new Map<string, string[]>()
  const reverseAdj = new Map<string, string[]>()

  for (const edge of edges) {
    const existing = adj.get(edge.fromVar) || []
    existing.push(edge.toVar)
    adj.set(edge.fromVar, existing)

    const revExisting = reverseAdj.get(edge.toVar) || []
    revExisting.push(edge.fromVar)
    reverseAdj.set(edge.toVar, revExisting)
  }

  const chain: string[] = [startVar]
  const visited = new Set<string>([startVar])

  if (reverse) {
    // Walk backward: follow reverseAdj
    let current = startVar
    for (let i = 0; i < 20; i++) {
      const prev = reverseAdj.get(current)
      if (!prev || prev.length === 0) break
      const nextVar = prev[0]!
      if (visited.has(nextVar)) break
      chain.unshift(nextVar)
      visited.add(nextVar)
      current = nextVar
    }
  } else {
    // Walk forward: follow adj
    let current = startVar
    for (let i = 0; i < 20; i++) {
      const next = adj.get(current)
      if (!next || next.length === 0) break
      const nextVar = next[0]!
      if (visited.has(nextVar)) break
      chain.push(nextVar)
      visited.add(nextVar)
      current = nextVar
    }
  }

  return "  " + chain.join(" → ")
}
