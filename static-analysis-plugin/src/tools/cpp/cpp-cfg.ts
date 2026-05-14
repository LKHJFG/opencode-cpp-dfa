/**
 * C++ Control Flow Graph Builder
 *
 * Builds a Control Flow Graph (CFG) from C++ source code line-by-line.
 * Identifies basic blocks, control flow edges, and variable definitions/uses.
 */

import { type BlockId, type Statement, type BasicBlock, type ControlFlowGraph, printCFG } from "./cfg-types"
export { type BlockId, type Statement, type BasicBlock, type ControlFlowGraph, printCFG }

// ============================================================
// Regex Patterns for C++ Variable Extraction
// ============================================================

// Matches variable declarations: int a; int a = 10; int a = b + 1;
const DECL_PATTERN = /\b(?:int|float|double|char|bool|auto|string|void|size_t|long|short|unsigned|signed|const)\s*\*{0,2}\s*&?\s*(\w+)\s*(?:=\s*([^;{]+))?/

// Matches plain assignments: a = b + 1; a += 2;
const ASSIGN_PATTERN = /^(\w+(?:\.\w+)*)\s*([+\-*/%&|^<>]=?|=(?!=))\s*([^;]*)/

// Matches function calls: foo(a, b);
const FUNC_CALL_PATTERN = /(\w+)\s*\(([^)]*)\)/

// Matches control flow keywords
const CONTROL_KEYWORDS = /\b(if|else|for|while|switch|case|break|continue|return|goto)\b/

// Types that can be declared
const CPP_TYPES = new Set([
  "int", "float", "double", "char", "bool", "auto", "string",
  "void", "size_t", "long", "short", "unsigned", "signed", "const",
])

// ============================================================
// Variable Extraction Utilities
// ============================================================

/**
 * Extract variables referenced in an expression string.
 * Returns unique variable names.
 */
function extractUsedVars(expr: string): string[] {
  if (!expr || expr.trim() === "") return []

  const vars: string[] = []
  // Match identifiers (words) that are not C++ keywords
  const idPattern = /\b([a-zA-Z_]\w*)\b/g
  let match: RegExpExecArray | null

  while ((match = idPattern.exec(expr)) !== null) {
    const name = match[1]!
    // Filter out C++ keywords and literals
    if (!CPP_TYPES.has(name) && name !== "true" && name !== "false" && name !== "NULL" && name !== "nullptr") {
      // Filter out numbers
      if (!/^\d+$/.test(name)) {
        vars.push(name)
      }
    }
  }

  return [...new Set(vars)]
}

/**
 * Parse a single line of C++ code and extract statement information.
 */
function parseLine(line: string, lineNum: number): Statement | null {
  const trimmed = line.trim()

  // Skip empty lines, comments, preprocessor directives
  if (
    trimmed === "" ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("}")
  ) {
    return null
  }

  // Strip inline comments
  const code = trimmed.replace(/\/\/.*$/, "").trim()
  if (code === "") return null

  // Detect control flow keywords (these are not full statements to add, but markers)
  // Return statement
  if (code.startsWith("return")) {
    const returnExpr = code.replace(/^return\s*/, "").replace(/;$/, "").trim()
    return {
      type: "return",
      text: code,
      line: lineNum,
      column: trimmed.indexOf(code[0]!) + 1,
      defVars: [],
      useVars: extractUsedVars(returnExpr),
    }
  }

  // If/for/while/switch header (will become a block boundary)
  if (/^(if|for|while|switch|else\s+if)\b/.test(code)) {
    return {
      type: "unknown",
      text: code,
      line: lineNum,
      column: trimmed.indexOf(code[0]!) + 1,
      defVars: [],
      useVars: extractUsedVars(code),
    }
  }

  // Variable declaration: int a = expr;
  const declMatch = code.match(DECL_PATTERN)
  if (declMatch) {
    const varName = declMatch[1]!
    const initExpr = declMatch[2]
    return {
      type: "variable_declaration",
      text: code,
      line: lineNum,
      column: trimmed.indexOf(code[0]!) + 1,
      defVars: [varName],
      useVars: initExpr ? extractUsedVars(initExpr) : [],
    }
  }

  // Assignment: a = expr;
  const assignMatch = code.match(ASSIGN_PATTERN)
  if (assignMatch) {
    const target = assignMatch[1]!
    const rhs = assignMatch[3]!
    return {
      type: "assignment",
      text: code,
      line: lineNum,
      column: trimmed.indexOf(code[0]!) + 1,
      defVars: [target],
      useVars: extractUsedVars(rhs),
    }
  }

  // Expression / function call
  const funcMatch = code.match(FUNC_CALL_PATTERN)
  if (funcMatch) {
    // Could be a function call expression
    return {
      type: "function_call",
      text: code,
      line: lineNum,
      column: trimmed.indexOf(code[0]!) + 1,
      defVars: [],
      useVars: extractUsedVars(code),
    }
  }

  // Generic expression
  const usedVars = extractUsedVars(code)
  if (usedVars.length > 0) {
    return {
      type: "expression",
      text: code,
      line: lineNum,
      column: trimmed.indexOf(code[0]!) + 1,
      defVars: [],
      useVars: usedVars,
    }
  }

  return null
}

/**
 * Determine if a line starts a block (opens brace).
 */
function opensBrace(line: string): boolean {
  return line.includes("{")
}

/**
 * Determine if a line ends a block (closes brace).
 */
function closesBrace(line: string): boolean {
  return line.includes("}")
}

/**
 * Count braces in a line (net open vs close).
 */
function netBraceCount(line: string): number {
  const open = (line.match(/{/g) || []).length
  const close = (line.match(/}/g) || []).length
  return open - close
}

// ============================================================
// CFG Builder
// ============================================================

/**
 * Build a Control Flow Graph from C++ source lines.
 *
 * Algorithm:
 * 1. Scan lines top-to-bottom tracking brace depth
 * 2. Split into basic blocks at control flow boundaries (if/for/while/switch)
 * 3. Extract variable defs and uses for each line
 * 4. Connect blocks via successor/predecessor edges
 *
 * @param sourceLines Array of source code lines
 * @param functionName Name of the function (optional)
 * @returns ControlFlowGraph
 */
export function buildCFG(sourceLines: string[], functionName: string = "global"): ControlFlowGraph {
  const blocks = new Map<BlockId, BasicBlock>()
  let nextBlockId: BlockId = 0
  let currentBlock: BasicBlock | null = null
  let braceDepth = 0
  let inFunction = false
  let functionBraceDepth = -1

  const pendingEdges: Array<{ from: BlockId; to: BlockId }> = []
  // Stack of if/else blocks for connecting conditional branches
  const branchStack: BlockId[] = []
  // Track else-if chains: we need to know if preceding sibling was an if
  const pendingElse: BlockId[] = []
  // Track loop heads for back edges
  const loopStack: BlockId[] = []

  function startNewBlock(label: string, line: number): BlockId {
    const id = nextBlockId++
    const block: BasicBlock = {
      id,
      label,
      startLine: line,
      endLine: line,
      statements: [],
      successors: [],
      predecessors: [],
    }
    blocks.set(id, block)
    currentBlock = block
    return id
  }

  function finalizeCurrentBlock(endLine: number) {
    const cb = currentBlock
    if (cb) {
      cb.endLine = endLine
    }
  }

  /** Get current block (non-null after startNewBlock is called) */
  function getCurrentBlock(): BasicBlock {
    return currentBlock as BasicBlock
  }

  // Create entry block
  startNewBlock("entry", 1)

  for (let i = 0; i < sourceLines.length; i++) {
    const lineNum = i + 1
    const line = sourceLines[i]!

    // Detect function definition start (heuristic)
    if (!inFunction) {
      const funcMatch = line.match(
        /\b(?:int|float|double|char|bool|auto|string|void|size_t|long)\s+\w+\s*\([^)]*\)\s*(?:const\s*)?(?:\{|$)/
      ) || line.match(
        /^\w+\s+\w+\s*\([^)]*\)\s*(?:\{|$)/
      )
      if (funcMatch && opensBrace(line) && braceDepth === 0) {
        inFunction = true
        functionBraceDepth = braceDepth + netBraceCount(line)
        // finalize entry block if needed
        finalizeCurrentBlock(lineNum - 1)
      }
    }

    const trimmed = line.trim()

    // Detect control flow structures
    const isIfStatement = /^if\s*\(/.test(trimmed)
    const isElseStatement = /^else/.test(trimmed)
    const isForStatement = /^for\s*\(/.test(trimmed)
    const isWhileStatement = /^while\s*\(/.test(trimmed)
    const isSwitchStatement = /^switch\s*\(/.test(trimmed)
    const isReturnStatement = /^return\b/.test(trimmed)

    if (isIfStatement) {
      // End current block, start new block for if
      finalizeCurrentBlock(lineNum - 1)
      const ifBlock = startNewBlock(`if(L${lineNum})`, lineNum)
      // Edge from previous block to if block
      pendingEdges.push({ from: ifBlock - 1, to: ifBlock })
      branchStack.push(ifBlock)
      loopStack.push(ifBlock)
    } else if (isElseStatement && branchStack.length > 0) {
      finalizeCurrentBlock(lineNum - 1)
      const elseBlock = startNewBlock(`else(L${lineNum})`, lineNum)
      // Edge from the matching if to the else block
      const ifBlockId = branchStack[branchStack.length - 1]
      if (ifBlockId !== undefined) {
        pendingEdges.push({ from: ifBlockId, to: elseBlock })
      }
      // Pop the if from top of branch stack and push else
      branchStack[branchStack.length - 1] = elseBlock
    } else if (isForStatement || isWhileStatement) {
      finalizeCurrentBlock(lineNum - 1)
      const loopBlock = startNewBlock(`loop(L${lineNum})`, lineNum)
      pendingEdges.push({ from: loopBlock - 1, to: loopBlock })
      loopStack.push(loopBlock)
    } else if (isSwitchStatement) {
      finalizeCurrentBlock(lineNum - 1)
      const switchBlock = startNewBlock(`switch(L${lineNum})`, lineNum)
      pendingEdges.push({ from: switchBlock - 1, to: switchBlock })
    } else if (isReturnStatement) {
      // Add return as statement to current block
      const stmt = parseLine(line, lineNum)
      if (stmt) {
        try {
          const block = getCurrentBlock()
          block.statements.push(stmt)
          block.endLine = lineNum
        } catch {
          // No current block, skip
        }
      }
      continue
    }

    // Track brace depth for block boundaries
    const braceDelta = netBraceCount(trimmed)

    // Check for closing brace (block end)
    if (closesBrace(trimmed) && !opensBrace(trimmed)) {
      const oldBraceDepth = braceDepth
      braceDepth += braceDelta

      // When exiting a block, create a new block for the continuation
      if (braceDepth < oldBraceDepth && currentBlock) {
        finalizeCurrentBlock(lineNum)
        // If we're in an if/else branch stack, pop it
        if (branchStack.length > 0) {
          const branchEnd = branchStack.pop()!
        }
        // Connect loop back edge
        if (loopStack.length > 0 && branchStack.length === 0) {
          // Don't pop loop stack yet (loops can have multiple iterations)
        }

        // Start a new continuation block after the closing brace
        if (i + 1 < sourceLines.length) {
          const nextLine = sourceLines[i + 1]?.trim() ?? ""
          if (nextLine !== "" && !nextLine.startsWith("}") && !nextLine.startsWith("#")) {
            startNewBlock(`cont(L${lineNum + 1})`, lineNum + 1)
          }
        }
      }
    } else {
      // Track brace depth increase
      if (opensBrace(trimmed)) {
        if (braceDelta > 0) {
          braceDepth += braceDelta
        }
        // For opening brace on its own line, skip creating a separate block
        if (trimmed === "{") continue
      }

      braceDepth += braceDelta
    }

    // Parse regular statements
    const stmt = parseLine(line, lineNum)
    if (stmt) {
      try {
        const block = getCurrentBlock()
        block.statements.push(stmt)
        block.endLine = lineNum
      } catch {
        // No current block, skip
      }
    }
  }

  // Finalize last block
  try {
    finalizeCurrentBlock(sourceLines.length)
  } catch {
    // No block to finalize
  }

  // Connect edges
  for (const edge of pendingEdges) {
    const fromBlock = blocks.get(edge.from)
    const toBlock = blocks.get(edge.to)
    if (fromBlock && toBlock) {
      if (!fromBlock.successors.includes(edge.to)) {
        fromBlock.successors.push(edge.to)
      }
      if (!toBlock.predecessors.includes(edge.from)) {
        toBlock.predecessors.push(edge.from)
      }
    }
  }

  // Connect sequential blocks (block i → block i+1 if no other edge exists)
  const blockIds = [...blocks.keys()].sort((a, b) => a - b)
  for (let i = 0; i < blockIds.length - 1; i++) {
    const current = blocks.get(blockIds[i]!)
    const next = blocks.get(blockIds[i + 1]!)
    if (current && next) {
      // Only add sequential edge if not already connected
      if (current.successors.length === 0 && !current.statements.some((s) => s.type === "return")) {
        current.successors.push(next.id)
        next.predecessors.push(current.id)
      }
    }
  }

  // Determine exit block (last block, or blocks ending with return)
  let exitBlock: BlockId = blockIds.length > 0 ? blockIds[blockIds.length - 1]! : 0

  return {
    blocks,
    entryBlock: 0,
    exitBlock,
    functionName,
  }
}


