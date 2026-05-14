/**
 * Interprocedural (Cross-Function) Data Flow Analysis Engine
 *
 * Builds per-function CFGs from AST, constructs a call graph,
 * and traces variables across function call boundaries.
 */

import { type ControlFlowGraph, type Statement } from "./cpp-cfg"
import { type FlowEdge, type DefUseInfo, type TraceResult, buildDefUseChains, analyzeDataFlow } from "./cpp-dataflow"
import { type ParserResult } from "./cpp-parser"
import { buildASTCFG } from "./ast-to-cfg"

export interface FunctionCFG {
  name: string
  cfg: ControlFlowGraph
  duInfo: DefUseInfo
  params: string[]
  startLine: number
  endLine: number
}

export interface CallSite {
  callerFunc: string
  calleeFunc: string
  line: number
  column: number
  argVars: string[]
  returnCapture: string | null
}

export interface InterproceduralResult {
  edges: FlowEdge[]
  allVariables: string[]
  summary: string
  crossEdgesCount: number
  crossFunctionEdges: FlowEdge[]
}

function getNodeText(node: any): string {
  return node.text ?? ""
}

function findChild(node: any, type: string): any | null {
  if (!node) return null
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i)
    if (child && child.type === type) return child
  }
  return null
}

function findChildInTree(node: any, type: string): any | null {
  if (!node) return null
  if (node.type === type) return node
  for (let i = 0; i < node.namedChildCount; i++) {
    const found = findChildInTree(node.namedChild(i), type)
    if (found) return found
  }
  return null
}

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

function extractIdentifiersFromNode(node: any): string[] {
  const names: string[] = []
  function walk(n: any) {
    if (!n) return
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

function extractCallExpressionArgs(node: any): string[] {
  const args: string[] = []
  const argList = findChild(node, "argument_list")
  if (!argList) return args

  for (let i = 0; i < argList.namedChildCount; i++) {
    const arg = argList.namedChild(i)
    const ids = extractIdentifiersFromNode(arg)
    args.push(ids.length > 0 ? ids[0]! : "")
  }
  return args
}

function findContainingFunction(node: any): string | null {
  let current = node
  while (current) {
    if (current.type === "function_definition") {
      const declarator = findChild(current, "function_declarator")
      if (declarator) {
        const id = findChildInTree(declarator, "identifier")
        if (id) return getNodeText(id)
      }
    }
    current = current.parent
  }
  return null
}

function isInReturnStatement(node: any): boolean {
  let current = node
  while (current) {
    if (current.type === "return_statement") return true
    if (current.type === "function_definition") return false
    current = current.parent
  }
  return false
}

function findAssignmentTarget(node: any): string | null {
  let current = node
  while (current) {
    // C++ declaration: Type name = expr;
    // tree-sitter AST: declaration → init_declarator → identifier + initializer
    if (current.type === "init_declarator") {
      const id = findChild(current, "identifier")
      if (id) return getNodeText(id)
      // Fallback: first named child might be the identifier
      const first = current.namedChildCount > 0 ? current.namedChild(0) : null
      if (first && (first.type === "identifier" || first.type === "field_identifier")) {
        return getNodeText(first)
      }
      return null
    }
    if (current.type === "assignment_expression") {
      const lhs = current.namedChild(0)
      if (lhs) {
        const ids = extractIdentifiersFromNode(lhs)
        return ids.length > 0 ? ids[0]! : null
      }
    }
    if (current.type === "expression_statement" || current.type === "declaration") {
      current = current.parent
      continue
    }
    if (current.type === "function_definition") return null
    current = current.parent
  }
  return null
}

function walkTree(node: any, callback: (n: any) => void): void {
  if (!node) return
  callback(node)
  for (let i = 0; i < node.namedChildCount; i++) {
    walkTree(node.namedChild(i), callback)
  }
}

function getFunctionBodyRange(funcDef: any): { startLine: number; endLine: number } {
  const body = findChild(funcDef, "compound_statement")
  if (!body) {
    const startPos = funcDef.startPosition
    return { startLine: startPos.row + 1, endLine: startPos.row + 1 }
  }
  const startPos = body.startPosition
  const endPos = body.endPosition
  return { startLine: startPos.row + 1, endLine: endPos.row + 1 }
}

function extractParameterNamesFromDeclarator(declarator: any): string[] {
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

export function buildFunctionCFGs(tree: any, sourceLines: string[], filePath: string): Map<string, FunctionCFG> {
  const funcCfgs = new Map<string, FunctionCFG>()

  const root = tree.rootNode ?? tree
  walkTree(root, (node: any) => {
    if (node.type !== "function_definition") return

    const declarator = findChild(node, "function_declarator")
    if (!declarator) return

    const funcId = findChildInTree(declarator, "identifier")
    if (!funcId) return

    const funcName = getNodeText(funcId)
    const body = findChild(node, "compound_statement")
    if (!body) return

    const range = getFunctionBodyRange(node)

    const cfg = buildASTCFG(tree, sourceLines, funcName)
    const duInfo = buildDefUseChains(cfg, filePath)
    const params = extractParameterNamesFromDeclarator(declarator)

    funcCfgs.set(funcName, {
      name: funcName,
      cfg,
      duInfo,
      params,
      startLine: range.startLine,
      endLine: range.endLine,
    })
  })

  return funcCfgs
}

export function buildCallGraph(tree: any, funcCfgs: Map<string, FunctionCFG>, filterExternal = true): CallSite[] {
  const callSites: CallSite[] = []

  const root = tree.rootNode ?? tree
  walkTree(root, (node: any) => {
    if (node.type !== "call_expression") return

    const calleeId = findChildInTree(node, "identifier")
    if (!calleeId) return

    const calleeName = getNodeText(calleeId)
    if (filterExternal && !funcCfgs.has(calleeName)) return

    const callerName = findContainingFunction(node)
    if (!callerName) return

    const startPos = node.startPosition
    const argVars = extractCallExpressionArgs(node)

    let returnCapture: string | null = null
    if (isInReturnStatement(node)) {
      returnCapture = null
    } else {
      returnCapture = findAssignmentTarget(node)
    }

    callSites.push({
      callerFunc: callerName,
      calleeFunc: calleeName,
      line: startPos.row + 1,
      column: startPos.column,
      argVars,
      returnCapture,
    })
  })

  return callSites
}

function calleeParamMatch(funcCfgs: Map<string, FunctionCFG>, funcName: string, argVar: string, argIdx: number): string | null {
  const f = funcCfgs.get(funcName)
  if (!f || argIdx >= f.params.length) return null
  return f.params[argIdx] ?? null
}

export function traceInterprocedural(
  funcCfgs: Map<string, FunctionCFG>,
  callSites: CallSite[],
  startVar: string,
  startFunc: string,
  direction: "forward" | "backward" | "both",
  filePath: string,
  maxDepth: number = 3,
): InterproceduralResult {
  const allEdges: FlowEdge[] = []
  const visited = new Set<string>()

  function doTrace(
    varName: string,
    funcName: string,
    dir: "forward" | "backward" | "both",
    depth: number,
    parentEdge?: FlowEdge,
  ) {
    if (depth > maxDepth) return
    const key = `${funcName}:${varName}:${dir}:${depth}`
    if (visited.has(key)) return
    visited.add(key)

    const funcCfg = funcCfgs.get(funcName)
    if (!funcCfg) return

    const result = analyzeDataFlow(
      funcCfg.cfg, funcCfg.duInfo, varName, undefined, dir, filePath,
    )

    for (const edge of result.edges) {
      edge.fromFile = filePath
      edge.toFile = filePath
      allEdges.push(edge)
    }

    if (dir === "forward" || dir === "both") {
      for (const tracedVar of result.allVariables) {
        const relevantCallSites = callSites.filter(
          cs => cs.callerFunc === funcName && cs.argVars.includes(tracedVar)
        )
        for (const cs of relevantCallSites) {
          const argIdx = cs.argVars.indexOf(tracedVar)
          const calleeCfg = funcCfgs.get(cs.calleeFunc)
          if (!calleeCfg) continue
          const paramName = argIdx < calleeCfg.params.length ? calleeCfg.params[argIdx] : null
          if (!paramName) continue

          allEdges.push({
            fromVar: tracedVar, fromLine: cs.line, fromStatement: `${cs.calleeFunc}()`,
            fromFile: filePath,
            toVar: paramName, toLine: calleeCfg.startLine, toStatement: `param ${paramName}`,
            toFile: filePath,
            edgeType: "parameter",
          })

          doTrace(paramName, cs.calleeFunc, "forward", depth + 1)

          // After forward tracing the callee: detect ref/pointer parameter side effects
          // in void functions (no returnCapture). The modified param value flows back to
          // the caller's variable, enabling chained forward tracing through void function
          // calls like transformRef(val) → incrementRef(val) → doubleRef(val).
          if (!cs.returnCapture && calleeCfg.duInfo.definitions.has(paramName)) {
            allEdges.push({
              fromVar: paramName,
              fromLine: calleeCfg.endLine,
              fromStatement: `modified in ${cs.calleeFunc}()`,
              fromFile: filePath,
              toVar: tracedVar,
              toLine: cs.line,
              toStatement: `${cs.calleeFunc}(${cs.argVars.join(", ")})`,
              toFile: filePath,
              edgeType: "ref_param_out",
            })

            // No recursion needed — the outer loop at line 314 already iterates
            // over all call sites in relevantCallSites, so subsequent calls
            // (e.g., incrementRef after transformRef) are handled naturally.
          }
        }

          if (parentEdge && parentEdge.edgeType === "parameter") {
          const callSite = callSites.find(cs =>
            cs.calleeFunc === funcName &&
            cs.argVars.some((arg, idx) => arg && calleeParamMatch(funcCfgs, funcName, arg, idx) === tracedVar)
          )
          if (callSite && callSite.returnCapture && result.allVariables.length > 0) {
            const lastVar = result.allVariables.filter(v =>
              !funcCfgs.get(funcName)?.params.includes(v) && v !== varName
            ).pop() ?? tracedVar

            allEdges.push({
              fromVar: lastVar, fromLine: funcCfg.endLine, fromStatement: `return`,
              fromFile: filePath,
              toVar: callSite.returnCapture, toLine: callSite.line, toStatement: `= ${callSite.calleeFunc}()`,
              toFile: filePath,
              edgeType: "return",
            })

            doTrace(callSite.returnCapture, funcName, "forward", depth + 1)
          }
        }

        // Scan for pointer assignment: `int* ptr = &value` or `ptr = &value`
        const curCfg = funcCfgs.get(funcName)
        if (curCfg) {
          for (const [, block] of curCfg.cfg.blocks) {
            for (const stmt of block.statements) {
              if (stmt.defVars.length > 0 && stmt.text.includes(`&${tracedVar}`)) {
                for (const defVar of stmt.defVars) {
                  if (defVar !== tracedVar) {
                    allEdges.push({
                      fromVar: tracedVar,
                      fromLine: stmt.line,
                      fromStatement: stmt.text,
                      fromFile: filePath,
                      toVar: defVar,
                      toLine: stmt.line,
                      toStatement: stmt.text,
                      toFile: filePath,
                      edgeType: "pointer_assign",
                    })
                    doTrace(defVar, funcName, "forward", depth + 1)
                  }
                }
              }
            }
          }
        }
      }
    }

    if (dir === "backward" || dir === "both") {
      if (funcCfg.params.includes(varName)) {
        const callers = callSites.filter(cs => cs.calleeFunc === funcName)
        for (const cs of callers) {
          const argIdx = funcCfg.params.indexOf(varName)
          if (argIdx >= 0 && argIdx < cs.argVars.length && cs.argVars[argIdx]) {
            const argVar = cs.argVars[argIdx]

            allEdges.push({
              fromVar: argVar, fromLine: cs.line, fromStatement: `${cs.calleeFunc}(${argVar})`,
              fromFile: filePath,
              toVar: varName, toLine: funcCfg.startLine, toStatement: `param ${varName}`,
              toFile: filePath,
              edgeType: "parameter",
            })

            doTrace(argVar, cs.callerFunc, "backward", depth + 1)
          }
        }
      }

      for (const tracedVar of result.allVariables) {
        const callers = callSites.filter(cs =>
          cs.calleeFunc === funcName && cs.returnCapture !== null
        )
        for (const cs of callers) {
          if (cs.returnCapture) {
            allEdges.push({
              fromVar: tracedVar, fromLine: funcCfg.endLine, fromStatement: `return`,
              fromFile: filePath,
              toVar: cs.returnCapture, toLine: cs.line, toStatement: `= ${cs.calleeFunc}()`,
              toFile: filePath,
              edgeType: "return",
            })
            doTrace(cs.returnCapture, cs.callerFunc, "backward", depth + 1)
          }
        }
      }
    }
  }

  doTrace(startVar, startFunc, direction, 0)

  const crossEdges = allEdges.filter(e => e.edgeType === "parameter" || e.edgeType === "return")
  const allVars = [...new Set([startVar, ...allEdges.flatMap(e => [e.fromVar, e.toVar])])]

  return {
    edges: allEdges,
    allVariables: allVars,
    summary: `Interprocedural ${direction} trace: ${allVars.length} variables (${crossEdges.length} cross-function edges)`,
    crossEdgesCount: crossEdges.length,
    crossFunctionEdges: crossEdges,
  }
}