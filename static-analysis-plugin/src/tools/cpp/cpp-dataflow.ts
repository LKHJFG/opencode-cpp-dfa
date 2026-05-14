/**
 * C++ Data Flow Analysis Engine
 *
 * Builds def-use chains from a Control Flow Graph and performs
 * forward/backward variable tracking.
 *
 * Forward tracking: given a variable, find all variables it flows to.
 * Backward tracking: given a variable, find all variables that flow into it.
 */

import { type ControlFlowGraph, type BlockId, type Statement } from "./cpp-cfg"

// ============================================================
// Type Definitions
// ============================================================

export interface FlowEdge {
  fromVar: string
  fromLine: number
  fromStatement: string
  fromFile: string
  toVar: string
  toLine: number
  toStatement: string
  toFile: string
  edgeType: FlowEdgeType
}

export type FlowEdgeType =
  | "assignment"
  | "composition"
  | "extraction"
  | "pointer"
  | "offset"
  | "parameter"
  | "return"
  | "shared_memory"
  | "cross_file_call"
  | "cross_file_return"
  | "cross_file_deref"
  | "cross_file_ref_modify"
  | "cross_file_side_effect"
  | "ref_param_out"
  | "pointer_assign"

export interface DefRecord {
  variable: string
  line: number
  statement: string
  blockId: BlockId
}

export interface UseRecord {
  variable: string
  line: number
  statement: string
  blockId: BlockId
}

export interface DefUseInfo {
  /** variable name → list of definition records */
  definitions: Map<string, DefRecord[]>
  /** variable name → list of use records */
  uses: Map<string, UseRecord[]>
}

export interface TraceResult {
  startVariable: string
  direction: "forward" | "backward" | "both"
  edges: FlowEdge[]
  allVariables: string[]
  summary: string
  filePath: string
}

// ============================================================
// Def-Use Chain Builder
// ============================================================

/**
 * Build def-use chains from a Control Flow Graph.
 *
 * Scans all blocks and their statements to collect:
 * - Definitions: where a variable is assigned/written
 * - Uses: where a variable is read/referenced
 *
 * @param cfg The Control Flow Graph
 * @param filePath Source file path (for metadata)
 * @returns DefUseInfo with definitions and uses maps
 */
export function buildDefUseChains(cfg: ControlFlowGraph, filePath: string): DefUseInfo {
  const definitions = new Map<string, DefRecord[]>()
  const uses = new Map<string, UseRecord[]>()

  for (const [blockId, block] of cfg.blocks) {
    for (const stmt of block.statements) {
      // Track definitions (LHS variables)
      for (const defVar of stmt.defVars) {
        const record: DefRecord = {
          variable: defVar,
          line: stmt.line,
          statement: stmt.text,
          blockId,
        }
        const existing = definitions.get(defVar)
        if (existing) {
          existing.push(record)
        } else {
          definitions.set(defVar, [record])
        }
      }

      // Track uses (RHS variables)
      for (const useVar of stmt.useVars) {
        const record: UseRecord = {
          variable: useVar,
          line: stmt.line,
          statement: stmt.text,
          blockId,
        }
        const existing = uses.get(useVar)
        if (existing) {
          existing.push(record)
        } else {
          uses.set(useVar, [record])
        }
      }
    }
  }

  return { definitions, uses }
}

// ============================================================
// Forward Tracking
// ============================================================

/**
 * Trace a variable forward through the data flow.
 *
 * Starting from a variable definition, follows the chain of
 * assignments to find all variables that this variable flows into.
 *
 * Algorithm (BFS):
 * 1. Find the definition of the starting variable
 * 2. Find all statements that USE this variable (on RHS)
 * 3. For each such statement, check if it DEFINES a new variable (LHS)
 * 4. Collect the edge (sourceVar → targetVar)
 * 5. Recurse from the target variable
 * 6. Stop when no new variables found or max depth reached
 *
 * @param cfg The Control Flow Graph
 * @param duInfo Def-use information
 * @param varName Starting variable name
 * @param startLine Starting line (optional, uses first occurrence if omitted)
 * @returns Array of flow edges
 */
export function traceForward(
  cfg: ControlFlowGraph,
  duInfo: DefUseInfo,
  varName: string,
  startLine?: number,
): FlowEdge[] {
  const edges: FlowEdge[] = []
  const visited = new Set<string>()
  const queue: Array<{ name: string; fromEdge: FlowEdge | null }> = []

  queue.push({ name: varName, fromEdge: null })
  visited.add(varName)

  let iterations = 0
  const MAX_DEPTH = 20

  while (queue.length > 0 && iterations < MAX_DEPTH) {
    iterations++
    const current = queue.shift()!
    const currentVar = current.name

    // Find all uses of currentVar
    const useRecords = duInfo.uses.get(currentVar) || []

    for (const useRecord of useRecords) {
      // Skip if we have a start line constraint and this use is before it
      if (startLine !== undefined && useRecord.line < startLine) continue

      // Find what variables are defined in the same statement as this use
      const block = cfg.blocks.get(useRecord.blockId)
      if (!block) continue

      // Find other statements on the same line that define variables
      const sameLineStmts = block.statements.filter((s) => s.line === useRecord.line)

      for (const stmt of sameLineStmts) {
        for (const defVar of stmt.defVars) {
          if (defVar !== currentVar && !visited.has(defVar)) {
            // Create edge
            const edge: FlowEdge = {
              fromVar: currentVar,
              fromLine: useRecord.line,
              fromStatement: useRecord.statement,
              fromFile: "",
              toVar: defVar,
              toLine: stmt.line,
              toStatement: stmt.text,
              toFile: "",
              edgeType: determineEdgeType(useRecord.statement, stmt.text),
            }
            edges.push(edge)
            visited.add(defVar)
            queue.push({ name: defVar, fromEdge: edge })
          }
        }
      }
    }
  }

  return edges
}

// ============================================================
// Backward Tracking
// ============================================================

/**
 * Trace a variable backward through the data flow.
 *
 * Starting from where a variable is used/defined, traces back
 * through assignments to find all variables that flow into it.
 *
 * Algorithm (BFS):
 * 1. Find the definition(s) of the target variable
 * 2. For each definition, extract the variables used on the RHS
 * 3. For each RHS variable, find ITS definition
 * 4. Collect the edge (sourceVar → targetVar)
 * 5. Recurse from each source variable
 * 6. Stop when no more source variables found or max depth reached
 *
 * @param cfg The Control Flow Graph
 * @param duInfo Def-use information
 * @param varName Target variable name to trace backward from
 * @param startLine Starting line (optional)
 * @returns Array of flow edges (reverse direction: FROM sources TO target)
 */
export function traceBackward(
  cfg: ControlFlowGraph,
  duInfo: DefUseInfo,
  varName: string,
  startLine?: number,
): FlowEdge[] {
  const edges: FlowEdge[] = []
  const visited = new Set<string>()
  const queue: Array<{ name: string; fromEdge: FlowEdge | null }> = []

  queue.push({ name: varName, fromEdge: null })
  visited.add(varName)

  let iterations = 0
  const MAX_DEPTH = 20

  while (queue.length > 0 && iterations < MAX_DEPTH) {
    iterations++
    const current = queue.shift()!
    const currentVar = current.name

    // Find definitions of currentVar
    const defRecords = duInfo.definitions.get(currentVar) || []

    for (const defRecord of defRecords) {
      // Skip if start line constraint and this def is after it
      if (startLine !== undefined && defRecord.line > startLine) continue

      // Find the statement to extract RHS variables
      const block = cfg.blocks.get(defRecord.blockId)
      if (!block) continue

      const matchingStmt = block.statements.find(
        (s) => s.line === defRecord.line && s.defVars.includes(currentVar),
      )
      if (!matchingStmt) continue

      // Get the variables USED in this statement (RHS)
      for (const useVar of matchingStmt.useVars) {
        if (!visited.has(useVar)) {
          const edge: FlowEdge = {
            fromVar: useVar,
            fromLine: findDefinitionLine(duInfo, useVar, defRecord.line),
            fromStatement: findDefinitionStatement(duInfo, useVar),
            fromFile: "",
            toVar: currentVar,
            toLine: defRecord.line,
            toStatement: matchingStmt.text,
            toFile: "",
            edgeType: determineEdgeTypeFromTarget(matchingStmt.text, useVar, currentVar),
          }
          edges.push(edge)
          visited.add(useVar)
          queue.push({ name: useVar, fromEdge: edge })
        }
      }
    }
  }

  return edges
}

/**
 * Find the line number where a variable is defined (closest to a reference line).
 */
function findDefinitionLine(duInfo: DefUseInfo, varName: string, referenceLine: number): number {
  const defs = duInfo.definitions.get(varName)
  if (!defs || defs.length === 0) return 0

  // Find the definition closest to but not after the reference line
  let closest = defs[0]!
  for (const def of defs) {
    if (def.line <= referenceLine && def.line > closest.line) {
      closest = def
    }
  }
  return closest.line
}

/**
 * Find the statement text where a variable is defined.
 */
function findDefinitionStatement(duInfo: DefUseInfo, varName: string): string {
  const defs = duInfo.definitions.get(varName)
  if (!defs || defs.length === 0) return ""
  return defs[0]!.statement
}

// ============================================================
// Edge Type Determination
// ============================================================

/**
 * Determine the type of data flow edge based on statement patterns.
 */
function determineEdgeType(rhsStatement: string, lhsStatement: string): FlowEdgeType {
  const combined = `${rhsStatement} ${lhsStatement}`

  if (combined.includes("*") && !combined.includes("include")) return "pointer"
  if (combined.includes("->")) return "pointer"
  if (combined.includes(".")) return "extraction"
  if (combined.includes("[")) return "offset"
  if (combined.includes("(") && combined.includes(")")) return "parameter"
  if (lhsStatement.includes("return")) return "return"
  return "assignment"
}

function determineEdgeTypeFromTarget(statement: string, fromVar: string, _toVar: string): FlowEdgeType {
  if (statement.includes("*") && !statement.includes("include")) return "pointer"
  if (statement.includes("->")) return "pointer"
  if (statement.includes(".")) return "extraction"
  if (statement.includes("[")) return "offset"
  if (statement.includes("(") && fromVar.includes("(")) return "parameter"
  if (statement.startsWith("return")) return "return"
  return "assignment"
}

// ============================================================
// Complete Analysis
// ============================================================

/**
 * Perform full data flow analysis: both forward and/or backward tracking.
 *
 * @param cfg The Control Flow Graph
 * @param duInfo Def-use information
 * @param varName Variable name to trace
 * @param startLine Starting line (optional)
 * @param direction 'forward', 'backward', or 'both'
 * @param filePath Source file path
 * @returns TraceResult with all edges and summary
 */
export function analyzeDataFlow(
  cfg: ControlFlowGraph,
  duInfo: DefUseInfo,
  varName: string,
  startLine?: number,
  direction: "forward" | "backward" | "both" = "both",
  filePath: string = "",
): TraceResult {
  const allEdges: FlowEdge[] = []

  // Validate variable exists
  const hasDefs = duInfo.definitions.has(varName)
  const hasUses = duInfo.uses.has(varName)

  if (!hasDefs && !hasUses) {
    return {
      startVariable: varName,
      direction,
      edges: [],
      allVariables: [varName],
      summary: `Variable "${varName}" not found in the source code.`,
      filePath,
    }
  }

  // Forward trace
  if (direction === "forward" || direction === "both") {
    const forwardEdges = traceForward(cfg, duInfo, varName, startLine)
    allEdges.push(...forwardEdges)
  }

  // Backward trace
  if (direction === "backward" || direction === "both") {
    const backwardEdges = traceBackward(cfg, duInfo, varName, startLine)
    allEdges.push(...backwardEdges)
  }

  // Deduplicate edges
  const uniqueEdges = deduplicateEdges(allEdges)

  // Collect all unique variables
  const allVars = new Set<string>()
  allVars.add(varName)
  for (const edge of uniqueEdges) {
    allVars.add(edge.fromVar)
    allVars.add(edge.toVar)
  }

  // Build summary
  const summary = buildSummary(varName, direction, uniqueEdges, allVars)

  return {
    startVariable: varName,
    direction,
    edges: uniqueEdges,
    allVariables: [...allVars],
    summary,
    filePath,
  }
}

/**
 * Deduplicate flow edges based on (fromVar, toVar, fromLine, toLine).
 */
function deduplicateEdges(edges: FlowEdge[]): FlowEdge[] {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const key = `${edge.fromVar}:${edge.fromLine}->${edge.toVar}:${edge.toLine}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Build a human-readable summary of the trace result.
 */
function buildSummary(
  varName: string,
  direction: string,
  edges: FlowEdge[],
  allVars: Set<string>,
): string {
  const parts: string[] = []

  if (edges.length === 0) {
    return `Variable "${varName}" has no detectable data flow in the given direction.`
  }

  if (direction === "forward" || direction === "both") {
    const forwardEdges = edges.filter((e) => e.fromVar === varName || allVars.has(e.fromVar))
    if (forwardEdges.length > 0) {
      parts.push("Forward flow:")
      // Build chain: a → b → c
      const sorted = sortEdgesIntoChain(forwardEdges, varName)
      parts.push(`  ${sorted.join(" → ")}`)
    }
  }

  if (direction === "backward" || direction === "both") {
    const backwardEdges = edges.filter((e) => e.toVar === varName || allVars.has(e.toVar))
    if (backwardEdges.length > 0) {
      parts.push("Backward flow:")
      const sorted = sortEdgesIntoChain(backwardEdges, varName, true)
      parts.push(`  ${sorted.join(" → ")}`)
    }
  }

  parts.push("")
  parts.push(`Total variables: ${allVars.size}`)
  parts.push(`Flow edges: ${edges.length}`)

  return parts.join("\n")
}

/**
 * Sort edges into a readable chain format.
 * For forward: a → b → c (starting from varName)
 * For backward: c → b → a (ending at varName)
 */
function sortEdgesIntoChain(edges: FlowEdge[], varName: string, reverse: boolean = false): string[] {
  if (edges.length === 0) return [varName]

  // Build adjacency: fromVar → toVar
  const adj = new Map<string, string[]>()
  const allVars = new Set<string>()
  for (const edge of edges) {
    allVars.add(edge.fromVar)
    allVars.add(edge.toVar)
    const existing = adj.get(edge.fromVar) || []
    existing.push(edge.toVar)
    adj.set(edge.fromVar, existing)
  }

  // Walk from varName following edges
  const chain: string[] = [varName]
  let current = varName
  const visited = new Set<string>([varName])

  for (let i = 0; i < 20; i++) {
    const next = adj.get(current)
    if (!next || next.length === 0) break
    const nextVar = next[0]!
    if (visited.has(nextVar)) break
    chain.push(nextVar)
    visited.add(nextVar)
    current = nextVar
  }

  if (reverse) {
    // For backward, the edges are already from source → target
    // We want target → source, so reverse the chain
    return chain.reverse()
  }

  return chain
}
