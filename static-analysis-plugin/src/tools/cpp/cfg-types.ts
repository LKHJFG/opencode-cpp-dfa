/**
 * C++ Control Flow Graph Type Definitions
 *
 * Shared type definitions for CFG construction and analysis.
 */

// ============================================================
// Type Definitions
// ============================================================

export type BlockId = number

export interface Statement {
  type: "variable_declaration" | "assignment" | "expression" | "return" | "if" | "for" | "while" | "function_call" | "unknown"
  text: string
  line: number
  column: number
  /** Variables defined/written by this statement (LHS) */
  defVars: string[]
  /** Variables read/used by this statement (RHS) */
  useVars: string[]
}

export interface BasicBlock {
  id: BlockId
  label: string
  startLine: number
  endLine: number
  statements: Statement[]
  successors: BlockId[]
  predecessors: BlockId[]
}

export interface ControlFlowGraph {
  blocks: Map<BlockId, BasicBlock>
  entryBlock: BlockId
  exitBlock: BlockId
  functionName: string
}

/**
 * Pretty-print a CFG for debugging.
 */
export function printCFG(cfg: ControlFlowGraph): string {
  const lines: string[] = []
  lines.push(`CFG for function: ${cfg.functionName}`)
  lines.push(`Blocks: ${cfg.blocks.size}, Entry: ${cfg.entryBlock}, Exit: ${cfg.exitBlock}`)
  lines.push("")

  for (const [id, block] of cfg.blocks) {
    lines.push(`Block #${id} [${block.label}] (lines ${block.startLine}-${block.endLine})`)
    lines.push(`  Succ: [${block.successors.join(", ")}]`)
    lines.push(`  Pred: [${block.predecessors.join(", ")}]`)

    for (const stmt of block.statements) {
      lines.push(`  ${stmt.type}: ${stmt.text}`)
      if (stmt.defVars.length > 0) lines.push(`    def: [${stmt.defVars.join(", ")}]`)
      if (stmt.useVars.length > 0) lines.push(`    use: [${stmt.useVars.join(", ")}]`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
