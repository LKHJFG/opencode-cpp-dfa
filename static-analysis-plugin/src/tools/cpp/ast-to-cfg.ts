/**
 * AST→CFG Bridge for C++ Static Analysis
 *
 * Walks tree-sitter AST and produces the same ControlFlowGraph type as the
 * line-scan cpp-cfg.ts, enabling the DFA engine to work with AST-precise parsing.
 *
 * The DFA engine (buildDefUseChains, analyzeDataFlow in cpp-dataflow.ts)
 * operates on ControlFlowGraph — zero changes needed.
 */

import { type ControlFlowGraph, type BasicBlock, type BlockId, type Statement } from "./cfg-types"
import { type ParserResult } from "./cpp-parser"

// ============================================================
// Helpers
// ============================================================

const CPP_KEYWORDS = new Set([
  "true", "false", "nullptr", "NULL", "auto",
  "int", "float", "double", "char", "bool", "void",
  "const", "static", "extern", "inline", "virtual",
  "public", "private", "protected", "class", "struct",
  "if", "else", "for", "while", "do", "switch", "case", "return",
  "break", "continue", "goto", "try", "catch", "throw",
  "new", "delete", "sizeof", "typedef", "using", "namespace",
  "template", "typename", "this",
])

function getNodeText(node: any): string {
  return node.text ?? ""
}

function findChild(node: any, type: string): any | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i)
    if (child.type === type) return child
  }
  return null
}

function findFieldChild(node: any, fieldName: string): any | null {
  if (typeof node.childForFieldName === "function") {
    const child = node.childForFieldName(fieldName)
    if (child) return child
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    try {
      const child = node.namedChild(i)
      if ((child as any).fieldName === fieldName) return child
    } catch {
      // ignore
    }
  }
  return null
}

function findChildInTree(node: any, type: string): any | null {
  if (node.type === type) return node
  for (let i = 0; i < node.namedChildCount; i++) {
    const found = findChildInTree(node.namedChild(i), type)
    if (found) return found
  }
  return null
}

function extractIdentifiers(node: any): string[] {
  const names: string[] = []
  function walk(n: any) {
    if (n.type === "identifier" || n.type === "field_identifier") {
      const text = n.text ?? ""
      if (!CPP_KEYWORDS.has(text) && !/^\d+$/.test(text)) {
        names.push(text)
      }
    }
    for (let i = 0; i < n.namedChildCount; i++) {
      walk(n.namedChild(i))
    }
  }
  walk(node)
  return [...new Set(names)]
}

function extractParameterNames(declarator: any): string[] {
  const names: string[] = []
  const paramList = findChild(declarator, "parameter_list")
  if (!paramList) return names

  for (let i = 0; i < paramList.namedChildCount; i++) {
    const param = paramList.namedChild(i)
    if (param.type === "parameter_declaration") {
      const id = findChildInTree(param, "identifier")
      if (id) names.push(getNodeText(id))
    }
  }
  return names
}

// ============================================================
// Statement Extraction from AST Nodes
// ============================================================

function extractStatementFromNode(node: any): Statement | null {
  const nodeType = node.type
  const startPos = node.startPosition

  const make = (
    type: Statement["type"],
    defVars: string[],
    useVars: string[]
  ): Statement => ({
    type,
    text: getNodeText(node),
    line: startPos.row + 1,
    column: startPos.column,
    defVars,
    useVars,
  })

  if (nodeType === "declaration") {
    const initDecl = findChild(node, "init_declarator")
    const plainDecl = findChildInTree(node, "identifier")

    if (initDecl) {
      const lhsId = findChildInTree(initDecl, "identifier")
      const lhs = lhsId ? getNodeText(lhsId) : ""
      // Tree-sitter C++ uses a hidden _initializer rule, so there is NO
      // "initializer" child node — the expression (call_expression, etc.)
      // is a direct child of init_declarator.  Extract identifiers from
      // the whole init_declarator and filter out the LHS name.
      const allIds = extractIdentifiers(initDecl)
      const useVars = lhs ? allIds.filter(id => id !== lhs) : allIds
      return make("variable_declaration", lhs ? [lhs] : [], useVars)
    } else if (plainDecl) {
      return make("variable_declaration", [getNodeText(plainDecl)], [])
    }
    return make("variable_declaration", [], [])
  }

  if (nodeType === "assignment_expression") {
    const lhs = node.namedChild(0)
    const lhsName = lhs ? (extractIdentifiers(lhs)[0] ?? "") : ""
    const rhs = node.namedChild(node.namedChildCount - 1)
    const useVars = rhs ? extractIdentifiers(rhs) : []
    return make("assignment", lhsName ? [lhsName] : [], useVars)
  }

  if (nodeType === "call_expression") {
    const args = findChild(node, "argument_list")
    const useVars = args ? extractIdentifiers(args) : []
    return make("function_call", [], useVars)
  }

  if (nodeType === "return_statement") {
    const siblings: any[] = []
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i)
      if (c && c.type !== "return") siblings.push(c)
    }
    const useVars = siblings.length > 0
      ? extractIdentifiers({ namedChildCount: siblings.length, namedChild: (i: number) => siblings[i] })
      : []
    return make("return", [], useVars)
  }

  if (nodeType === "if_statement") {
    const cond = findChild(node, "condition")
    const useVars = cond ? extractIdentifiers(cond) : []
    return make("if", [], useVars)
  }

  if (nodeType === "for_statement") {
    const cond = findChild(node, "condition") || findChild(node, "initializer") || findChild(node, "update_expression")
    const useVars = cond ? extractIdentifiers(cond) : []
    return make("for", [], useVars)
  }

  if (nodeType === "while_statement") {
    const cond = findChild(node, "condition")
    const useVars = cond ? extractIdentifiers(cond) : []
    return make("while", [], useVars)
  }

  if (nodeType === "switch_statement") {
    const cond = findChild(node, "condition")
    const useVars = cond ? extractIdentifiers(cond) : []
    return make("unknown", [], useVars)
  }

  return make("unknown", [], extractIdentifiers(node))
}

function extractStatementFromExpressionStatement(node: any): Statement | null {
  const inner = findChild(node, "call_expression")
    || findChild(node, "assignment_expression")
    || findChild(node, "update_expression")
    || findChild(node, "binary_expression")
    || findChild(node, "unary_expression")

  if (inner) {
    return extractStatementFromNode(inner)
  }

  const useVars = extractIdentifiers(node)
  if (useVars.length > 0) {
    return {
      type: "expression",
      text: getNodeText(node),
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      defVars: [],
      useVars,
    }
  }

  return null
}

// ============================================================
// Core CFG Building Logic
// ============================================================

/**
 * Build a ControlFlowGraph from a tree-sitter AST.
 *
 * Walks the AST looking for function_definition nodes, then recursively
 * walks each function body to build basic blocks with proper control flow
 * edges. Produces the same ControlFlowGraph type as buildCFG().
 *
 * @param tree       ParserResult tree (tree-sitter output)
 * @param sourceLines Array of source lines (used for line numbers)
 * @param functionName Optional function name to target
 * @returns ControlFlowGraph
 */
export function buildASTCFG(
  tree: any,
  sourceLines: string[],
  functionName?: string
): ControlFlowGraph {
  const blocks = new Map<BlockId, BasicBlock>()
  let nextBlockId: BlockId = 0

  let entryBlockId: BlockId = 0
  let exitBlockId: BlockId = 0
  let currentBlockId: BlockId = 0

  function startBlock(label: string, line: number): BlockId {
    const id = nextBlockId++
    blocks.set(id, {
      id,
      label,
      startLine: line,
      endLine: line,
      statements: [],
      successors: [],
      predecessors: [],
    })
    currentBlockId = id
    return id
  }

  function finalizeBlock(id: BlockId, endLine: number) {
    const block = blocks.get(id)
    if (block) block.endLine = endLine
  }

  function addSuccessor(from: BlockId, to: BlockId) {
    const b = blocks.get(from)
    if (b && !b.successors.includes(to)) b.successors.push(to)
    const t = blocks.get(to)
    if (t && !t.predecessors.includes(from)) t.predecessors.push(from)
  }

  function finalizeCurrent(endLine: number) {
    finalizeBlock(currentBlockId, endLine)
  }

  function switchTo(id: BlockId) {
    currentBlockId = id
  }

  function addStmtToCurrent(stmt: Statement) {
    const block = blocks.get(currentBlockId)
    if (block) {
      block.statements.push(stmt)
      block.endLine = Math.max(block.endLine, stmt.line)
    }
  }

  const branchStack: BlockId[] = []

  // Find function definitions in the tree
  const funcNodes: any[] = []
  function findFuncDefs(node: any) {
    if (node.type === "function_definition") funcNodes.push(node)
    for (let i = 0; i < node.namedChildCount; i++) {
      findFuncDefs(node.namedChild(i))
    }
  }
  findFuncDefs(tree.rootNode)

  if (funcNodes.length === 0) {
    return {
      blocks,
      entryBlock: 0,
      exitBlock: 0,
      functionName: functionName ?? "unknown",
    }
  }

  // Pick target function
  let targetFunc = funcNodes[0]
  if (functionName) {
    for (const fn of funcNodes) {
      const decl = findChild(fn, "function_declarator")
      const nameNode = decl ? (findChild(decl, "identifier") || findChildInTree(decl, "identifier")) : null
      if (nameNode && getNodeText(nameNode) === functionName) {
        targetFunc = fn
        break
      }
    }
  }

  // Extract function name and parameters
  const decl = findChild(targetFunc, "function_declarator")
  const funcNameNode = decl
    ? (findChild(decl, "identifier") || findChildInTree(decl, "identifier"))
    : null
  const funcName = funcNameNode ? getNodeText(funcNameNode) : "unknown"
  const paramNames = decl ? extractParameterNames(decl) : []

  // Locate function body
  const compoundStmt = findChild(targetFunc, "compound_statement")
  const bodyStartLine = targetFunc.startPosition.row + 1

  // Create entry and exit blocks
  entryBlockId = startBlock(`entry(${funcName})`, bodyStartLine)
  exitBlockId = startBlock(`exit(${funcName})`, bodyStartLine)

  // Add parameters as defined variables in entry block
  for (const param of paramNames) {
    addStmtToCurrent({
      type: "variable_declaration",
      text: param,
      line: bodyStartLine,
      column: 0,
      defVars: [param],
      useVars: [],
    })
  }

  switchTo(entryBlockId)

  // ============================================================
  // Statement Walking
  // ============================================================

  function walkStatements(stmtList: any, isLoopBody = false) {
    if (!stmtList || stmtList.type === "ERROR" || stmtList.type === "comment") return
    if (currentBlockId === exitBlockId) return

    if (stmtList.type === "if_statement") {
      const condLine = stmtList.startPosition.row + 1
      const savedBlock = currentBlockId

      finalizeCurrent(condLine - 1)
      const ifBlockId = startBlock(`if(L${condLine})`, condLine)
      addSuccessor(savedBlock, ifBlockId)

      const ifStmt = extractStatementFromNode(stmtList)
      if (ifStmt) addStmtToCurrent(ifStmt)
      branchStack.push(ifBlockId)

      const thenBranch = findFieldChild(stmtList, "consequence")
      const elseBranch = findFieldChild(stmtList, "alternative")

      if (thenBranch && thenBranch.type === "compound_statement") {
        finalizeCurrent(condLine)
        switchTo(ifBlockId)
        const thenBlockId = startBlock(`then(L${condLine})`, condLine)
        addSuccessor(ifBlockId, thenBlockId)
        switchTo(thenBlockId)
        walkStatements(thenBranch, isLoopBody)
        finalizeCurrent(thenBranch.endPosition.row + 1)
      }

      const afterIfLine = stmtList.endPosition.row + 1

      if (elseBranch && elseBranch.type === "if_statement") {
        // else-if chain
        branchStack.push(branchStack[branchStack.length - 1] ?? ifBlockId)
        const savedLen = branchStack.length
        walkStatements(elseBranch, isLoopBody)
        branchStack.length = savedLen - 1
      } else if (elseBranch) {
        finalizeCurrent(afterIfLine - 1)
        const elseBlockId = startBlock(`else(L${afterIfLine})`, afterIfLine)
        const parentIfId = branchStack.pop() ?? ifBlockId
        addSuccessor(parentIfId, elseBlockId)

        if (elseBranch.type === "compound_statement") {
          switchTo(elseBlockId)
          walkStatements(elseBranch, isLoopBody)
          finalizeCurrent(elseBranch.endPosition.row + 1)
        }

        if (isLoopBody) {
          addSuccessor(currentBlockId, exitBlockId)
        }
      } else {
        // No else: if block connects to exit
        branchStack.pop()
        addSuccessor(ifBlockId, exitBlockId)
      }
    } else if (stmtList.type === "for_statement") {
      const forLine = stmtList.startPosition.row + 1
      const savedBlock = currentBlockId

      finalizeCurrent(forLine - 1)
      const forBlockId = startBlock(`for(L${forLine})`, forLine)
      addSuccessor(savedBlock, forBlockId)

      const forStmt = extractStatementFromNode(stmtList)
      if (forStmt) addStmtToCurrent(forStmt)
      branchStack.push(forBlockId)

      const body = findChild(stmtList, "body")
      if (body && body.type === "compound_statement") {
        finalizeCurrent(forLine)
        switchTo(forBlockId)
        const bodyBlockId = startBlock(`for_body(L${forLine})`, forLine)
        addSuccessor(forBlockId, bodyBlockId)
        switchTo(bodyBlockId)
        walkStatements(body, true)
        finalizeCurrent(body.endPosition.row + 1)
        addSuccessor(currentBlockId, forBlockId)
      }

      branchStack.pop()
    } else if (stmtList.type === "while_statement") {
      const whileLine = stmtList.startPosition.row + 1
      const savedBlock = currentBlockId

      finalizeCurrent(whileLine - 1)
      const whileBlockId = startBlock(`while(L${whileLine})`, whileLine)
      addSuccessor(savedBlock, whileBlockId)

      const whileStmt = extractStatementFromNode(stmtList)
      if (whileStmt) addStmtToCurrent(whileStmt)
      branchStack.push(whileBlockId)

      const body = findChild(stmtList, "body")
      if (body && body.type === "compound_statement") {
        finalizeCurrent(whileLine)
        switchTo(whileBlockId)
        const bodyBlockId = startBlock(`while_body(L${whileLine})`, whileLine)
        addSuccessor(whileBlockId, bodyBlockId)
        switchTo(bodyBlockId)
        walkStatements(body, true)
        finalizeCurrent(body.endPosition.row + 1)
        addSuccessor(currentBlockId, whileBlockId)
      }

      branchStack.pop()
    } else if (stmtList.type === "do_statement") {
      const doLine = stmtList.startPosition.row + 1
      const savedBlock = currentBlockId

      finalizeCurrent(doLine - 1)
      const doBlockId = startBlock(`do(L${doLine})`, doLine)
      addSuccessor(savedBlock, doBlockId)

      const body = findChild(stmtList, "body")
      if (body && body.type === "compound_statement") {
        switchTo(doBlockId)
        walkStatements(body, true)
        finalizeCurrent(body.endPosition.row + 1)
        addSuccessor(currentBlockId, doBlockId)
      }
    } else if (stmtList.type === "switch_statement") {
      const swLine = stmtList.startPosition.row + 1
      const savedBlock = currentBlockId

      finalizeCurrent(swLine - 1)
      const swBlockId = startBlock(`switch(L${swLine})`, swLine)
      addSuccessor(savedBlock, swBlockId)

      const swStmt = extractStatementFromNode(stmtList)
      if (swStmt) addStmtToCurrent(swStmt)
    } else if (stmtList.type === "return_statement") {
      const retStmt = extractStatementFromNode(stmtList)
      if (retStmt) addStmtToCurrent(retStmt)
      const retLine = stmtList.endPosition.row + 1
      finalizeBlock(currentBlockId, retLine)
      addSuccessor(currentBlockId, exitBlockId)
      switchTo(exitBlockId)
      return
    } else if (stmtList.type === "break_statement") {
      const brkLine = stmtList.startPosition.row + 1
      finalizeBlock(currentBlockId, brkLine)
      if (isLoopBody) {
        addSuccessor(currentBlockId, exitBlockId)
      } else if (branchStack.length > 0) {
        addSuccessor(currentBlockId, branchStack[branchStack.length - 1] ?? exitBlockId)
      }
      switchTo(exitBlockId)
      return
    } else if (stmtList.type === "continue_statement") {
      const contLine = stmtList.startPosition.row + 1
      finalizeBlock(currentBlockId, contLine)
    } else if (stmtList.type === "declaration"
      || stmtList.type === "assignment_expression"
      || stmtList.type === "call_expression") {
      const stmt = extractStatementFromNode(stmtList)
      if (stmt) addStmtToCurrent(stmt)
    } else if (stmtList.type === "expression_statement") {
      const inner = findChild(stmtList, "call_expression")
        || findChild(stmtList, "assignment_expression")
        || findChild(stmtList, "update_expression")
      if (inner) {
        const stmt = extractStatementFromNode(inner)
        if (stmt) addStmtToCurrent(stmt)
      } else {
        const stmt = extractStatementFromExpressionStatement(stmtList)
        if (stmt) addStmtToCurrent(stmt)
      }
    } else if (stmtList.type === "compound_statement") {
      for (let i = 0; i < stmtList.namedChildCount; i++) {
        const child = stmtList.namedChild(i)
        if (child.type === "comment") continue
        walkStatements(child, isLoopBody)
        if (currentBlockId === exitBlockId) break
      }
    } else {
      const stmt = extractStatementFromNode(stmtList)
      if (stmt) addStmtToCurrent(stmt)
    }
  }

  if (compoundStmt) {
    walkStatements(compoundStmt)
  } else {
    for (let i = 0; i < targetFunc.namedChildCount; i++) {
      const child = targetFunc.namedChild(i)
      if (child.type === "comment") continue
      walkStatements(child)
    }
  }

  // Connect dangling blocks to exit
  finalizeBlock(currentBlockId, (compoundStmt?.endPosition.row ?? sourceLines.length - 1) + 1)
  if (currentBlockId !== exitBlockId) {
    addSuccessor(currentBlockId, exitBlockId)
  }

  // Finalize exit block
  const lastLine = compoundStmt?.endPosition.row ?? sourceLines.length
  finalizeBlock(exitBlockId, lastLine)

  return {
    blocks,
    entryBlock: entryBlockId,
    exitBlock: exitBlockId,
    functionName: funcName,
  }
}