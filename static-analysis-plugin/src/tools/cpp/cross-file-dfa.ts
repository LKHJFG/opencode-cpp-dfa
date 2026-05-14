/**
 * Cross-File Interprocedural Data Flow Analysis Engine
 *
 * Extends single-file interprocedural DFA to work across multiple
 * C++ source files. Builds a global function registry and traces
 * variables across file boundaries.
 */

import { readdirSync, existsSync, statSync } from "fs"
import { join, relative, basename } from "path"
import {
  type FunctionCFG,
  type CallSite,
  type InterproceduralResult,
  buildFunctionCFGs,
  buildCallGraph,
  traceInterprocedural,
} from "./cross-function-dfa"
import { CppParser } from "./cpp-parser"
import { type FlowEdge } from "./cpp-dataflow"

export interface FileAnalysis {
  filePath: string
  funcCfgs: Map<string, FunctionCFG>
  callSites: CallSite[]
  sourceLines: string[]
  parseSuccess: boolean
  parseError?: string
}

export interface WorkspaceAnalysis {
  files: FileAnalysis[]
  globalFunctionRegistry: Map<string, {
    filePath: string
    cfg: FunctionCFG
  }>
  totalFiles: number
  parsedFiles: number
  totalFunctions: number
  summary: string
}

const CPP_EXTENSIONS = [".cpp", ".h", ".hpp", ".cc", ".cxx", ".hxx"]

function isCppFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."))
  return CPP_EXTENSIONS.includes(ext)
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

function walkTree(node: any, callback: (n: any) => void): void {
  if (!node) return
  callback(node)
  for (let i = 0; i < node.namedChildCount; i++) {
    walkTree(node.namedChild(i), callback)
  }
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

export function scanCppFiles(directory: string): string[] {
  const cppFiles: string[] = []

  function scanDir(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const item of entries) {
      const fullPath = join(dir, item)
      let stat: any = null
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        scanDir(fullPath)
      } else if (stat.isFile() && isCppFile(fullPath)) {
        cppFiles.push(fullPath)
      }
    }
  }

  if (existsSync(directory) && statSync(directory).isDirectory()) {
    scanDir(directory)
  }

  return cppFiles
}

async function analyzeSingleFile(
  filePath: string,
  parser: CppParser
): Promise<FileAnalysis> {
  try {
    const result = await parser.parseFile(filePath)
    const funcCfgs = buildFunctionCFGs(result.tree, result.sourceLines, filePath)
    const callSites = buildCallGraph(result.tree, funcCfgs, false)

    return {
      filePath,
      funcCfgs,
      callSites,
      sourceLines: result.sourceLines,
      parseSuccess: true,
    }
  } catch (err) {
    return {
      filePath,
      funcCfgs: new Map(),
      callSites: [],
      sourceLines: [],
      parseSuccess: false,
      parseError: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function analyzeWorkspace(directory: string): Promise<WorkspaceAnalysis> {
  const files = scanCppFiles(directory)
  const parser = CppParser.getInstance()
  await parser.init()

  const fileAnalyses: FileAnalysis[] = []
  let parsedFiles = 0
  let totalFunctions = 0
  const globalRegistry = new Map<string, { filePath: string; cfg: FunctionCFG }>()

  for (const filePath of files) {
    const analysis = await analyzeSingleFile(filePath, parser)
    fileAnalyses.push(analysis)

    if (analysis.parseSuccess) {
      parsedFiles++
      for (const [funcName, funcCfg] of analysis.funcCfgs) {
        if (!globalRegistry.has(funcName)) {
          globalRegistry.set(funcName, {
            filePath,
            cfg: funcCfg,
          })
        }
        totalFunctions++
      }
    }
  }

  const summary = `Analyzed ${files.length} files, ${parsedFiles} parsed successfully, ${totalFunctions} functions registered`

  return {
    files: fileAnalyses,
    globalFunctionRegistry: globalRegistry,
    totalFiles: files.length,
    parsedFiles,
    totalFunctions,
    summary,
  }
}

export function buildCrossFileCallGraph(
  workspace: WorkspaceAnalysis
): Map<string, { callers: CallSite[], definedIn: string }> {
  const callGraph = new Map<string, { callers: CallSite[], definedIn: string }>()

  for (const file of workspace.files) {
    for (const callSite of file.callSites) {
      const calleeName = callSite.calleeFunc
      const definedIn = workspace.globalFunctionRegistry.get(calleeName)?.filePath ?? "unknown"

      if (!callGraph.has(calleeName)) {
        callGraph.set(calleeName, { callers: [], definedIn })
      }

      callGraph.get(calleeName)!.callers.push(callSite)
    }
  }

  return callGraph
}

function findFunctionByVariable(
  workspace: WorkspaceAnalysis,
  varName: string,
  startFilePath: string
): { funcName: string; funcCfg: FunctionCFG } | null {
  const file = workspace.files.find(f => f.filePath === startFilePath)
  if (!file) return null

  for (const [funcName, funcCfg] of file.funcCfgs) {
    if (funcCfg.params.includes(varName)) {
      return { funcName, funcCfg }
    }

    const duInfo = funcCfg.duInfo
    if (duInfo.definitions.has(varName) || duInfo.uses.has(varName)) {
      return { funcName, funcCfg }
    }
  }

  return null
}

function mapCalleeParams(
  callSite: CallSite,
  calleeCfg: FunctionCFG,
  direction: "forward" | "backward"
): Map<string, string> {
  const mapping = new Map<string, string>()

  if (direction === "forward") {
    for (let i = 0; i < callSite.argVars.length; i++) {
      const argVar = callSite.argVars[i]
      if (i < calleeCfg.params.length && argVar) {
        mapping.set(argVar, calleeCfg.params[i]!)
      }
    }
  } else {
    for (let i = 0; i < calleeCfg.params.length; i++) {
      const argVar = callSite.argVars[i]
      if (argVar) {
        mapping.set(calleeCfg.params[i]!, argVar)
      }
    }
  }

  return mapping
}

function checkParamModifiedViaDeref(
  funcCfg: FunctionCFG,
  paramName: string,
  filePath: string
): boolean {
  const cfg = funcCfg.cfg
  let paramHasDefs = false

  for (const [blockId, block] of cfg.blocks) {
    for (const stmt of block.statements) {
      const stmtText = stmt.text

      // Check for pointer dereference pattern: *param = value
      if (stmtText && paramName) {
        const derefPattern = new RegExp(`\\*\\s*${escapeRegex(paramName)}\\s*=`)
        if (derefPattern.test(stmtText)) {
          return true
        }
      }

      // Check for reference parameter assignment or any param assignment:
      // When the param name appears in defVars, it means the function writes to it.
      // For reference (int&) params, this directly modifies the caller's variable.
      // For pointer dereferences, the *param = value pattern above catches it.
      // For pass-by-value reassignments (rare), this gives a conservative over-approximation.
      if (stmt.defVars && stmt.defVars.includes(paramName)) {
        paramHasDefs = true
      }

      // Also check the param being passed to another function that might modify it
      // via reference or pointer: e.g., transformRef(r) where r is int&
      if (stmtText && stmt.useVars && stmt.useVars.includes(paramName)) {
        // param is used as an argument in a call expression
        // Check if the statement looks like a function call with param as arg
        const callWithParam = new RegExp(`\\b\\w+\\s*\\([^)]*\\b${escapeRegex(paramName)}\\b[^)]*\\)`)
        if (callWithParam.test(stmtText) && stmt.defVars && stmt.defVars.length > 0) {
          return true
        }
      }
    }
  }

  // If the param has any definition records in the function body,
  // it was written to — likely a reference param modification.
  return paramHasDefs
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Checks if a function parameter was directly assigned within the function body
 * (as opposed to only being dereferenced). A direct assignment to a reference
 * parameter (int*&, int&) means the caller's variable gets a new value.
 * 
 * Example: void createAlias(int*& alias, int* target) { alias = target; }
 *   → param "alias" has a defVar entry for "alias = target"
 *   → returns true (caller's variable is modified)
 * 
 * Example: void writeViaAlias(int* alias, int value) { *alias = value; }
 *   → param "alias" has NO defVar (only *alias deref)
 *   → returns false (caller's pointer variable is NOT modified)
 */
function checkParamDirectlyAssigned(funcCfg: FunctionCFG, paramName: string): boolean {
  const cfg = funcCfg.cfg
  for (const [, block] of cfg.blocks) {
    for (const stmt of block.statements) {
      if (stmt.defVars && stmt.defVars.includes(paramName)) {
        return true
      }
    }
  }
  return false
}

export async function traceCrossFile(
  varName: string,
  startFilePath: string,
  direction: "forward" | "backward" | "both",
  workspace: WorkspaceAnalysis,
  maxDepth: number = 3
): Promise<InterproceduralResult> {
  const allEdges: FlowEdge[] = []
  const visited = new Set<string>()
  const enteredFuncs = new Set<string>()
  const crossFunctionEdges: FlowEdge[] = []

  const targetFile = workspace.files.find(f => f.filePath === startFilePath)
  if (!targetFile) {
    return {
      edges: [],
      allVariables: [varName],
      summary: `File not found: ${startFilePath}`,
      crossEdgesCount: 0,
      crossFunctionEdges: [],
    }
  }

  const funcEntry = findFunctionByVariable(workspace, varName, startFilePath)
  if (!funcEntry) {
    return {
      edges: [],
      allVariables: [varName],
      summary: `Variable ${varName} not found in ${startFilePath}`,
      crossEdgesCount: 0,
      crossFunctionEdges: [],
    }
  }

  const { funcName, funcCfg } = funcEntry
  const fileFuncCfgs = targetFile.funcCfgs
  const fileCallSites = targetFile.callSites

  const intraResult = traceInterprocedural(
    fileFuncCfgs,
    fileCallSites,
    varName,
    funcName,
    direction,
    startFilePath,
    maxDepth
  )

  allEdges.push(...intraResult.edges)
  const allVariablesSet = new Set(intraResult.allVariables)

  async function traceInFile(
    currentVar: string,
    currentFile: string,
    currentFunc: string,
    currentDir: "forward" | "backward" | "both",
    depth: number,
    fromFile?: string,
    edgeType?: string
  ): Promise<void> {
    if (depth > maxDepth) return

    const key = `${currentFile}:${currentFunc}:${currentVar}:${currentDir}:${depth}`
    if (visited.has(key)) return
    visited.add(key)

    const file = workspace.files.find(f => f.filePath === currentFile)
    if (!file || !file.parseSuccess) return

    const funcCfg = file.funcCfgs.get(currentFunc)
    if (!funcCfg) return

    const result = traceInterprocedural(
      file.funcCfgs,
      file.callSites,
      currentVar,
      currentFunc,
      currentDir,
      currentFile,
      maxDepth - depth
    )

    for (const edge of result.edges) {
      if (fromFile && edgeType) {
        edge.fromFile = fromFile
        edge.toFile = currentFile
      }
      allEdges.push(edge)
      crossFunctionEdges.push(edge)
    }

    for (const tracedVar of result.allVariables) {
      allVariablesSet.add(tracedVar)
    }

    if ((currentDir === "forward" || currentDir === "both") && depth < maxDepth) {
      const relevantCalls = file.callSites.filter(
        cs => cs.callerFunc === currentFunc && cs.argVars.includes(currentVar)
      )

      for (const cs of relevantCalls) {
        const isCrossFile = !file.funcCfgs.has(cs.calleeFunc)
        const calleeInfo = workspace.globalFunctionRegistry.get(cs.calleeFunc)

        if (!calleeInfo) continue

        const argIdx = cs.argVars.indexOf(currentVar)
        const calleeCfg = calleeInfo.cfg
        const paramName = argIdx < calleeCfg.params.length ? calleeCfg.params[argIdx] : null

        if (!paramName) continue

        const crossEdge: FlowEdge = {
          fromVar: currentVar,
          fromLine: cs.line,
          fromStatement: `${cs.calleeFunc}()`,
          fromFile: currentFile,
          toVar: paramName,
          toLine: calleeCfg.startLine,
          toStatement: `param ${paramName}`,
          toFile: calleeInfo.filePath,
          edgeType: isCrossFile ? "cross_file_call" : "parameter",
        }
        allEdges.push(crossEdge)
        if (isCrossFile) crossFunctionEdges.push(crossEdge)

        if (isCrossFile && calleeInfo.filePath !== currentFile) {
          const funcKey = `${calleeInfo.filePath}:${cs.calleeFunc}`
          if (!enteredFuncs.has(funcKey)) {
            enteredFuncs.add(funcKey)
            await traceInFile(
              paramName,
              calleeInfo.filePath,
              cs.calleeFunc,
              "forward",
              depth + 1,
              currentFile,
              "cross_file_call"
            )
          }

          // Handle return value capture from callee back to caller.
          // Example: int step1 = add(input, 10) → cs.returnCapture = "step1"
          if (cs.returnCapture) {
            // Find the last non-param variable traced in the callee as the return source
            const calleeFileData = workspace.files.find(f => f.filePath === calleeInfo.filePath)
            const calleeTracedCfg = calleeFileData?.funcCfgs.get(cs.calleeFunc)
            const calleeParams = calleeTracedCfg?.params ?? []
            const calleeTracedVars = allEdges
              .filter(e => e.fromFile === calleeInfo.filePath)
              .flatMap(e => [e.fromVar, e.toVar])
            const returnSourceVars = [...new Set(calleeTracedVars)]
              .filter(v => !calleeParams.includes(v) && v !== paramName)
            const returnFromVar: string = returnSourceVars.length > 0
              ? (returnSourceVars[returnSourceVars.length - 1] ?? paramName)
              : paramName

            const returnEdge: FlowEdge = {
              fromVar: returnFromVar,
              fromLine: calleeCfg.endLine,
              fromStatement: `return from ${cs.calleeFunc}()`,
              fromFile: calleeInfo.filePath,
              toVar: cs.returnCapture,
              toLine: cs.line,
              toStatement: `= ${cs.calleeFunc}()`,
              toFile: currentFile,
              edgeType: "cross_file_return",
            }
            allEdges.push(returnEdge)
            crossFunctionEdges.push(returnEdge)
            allVariablesSet.add(cs.returnCapture)

            // Continue tracing from the return capture variable in the caller
            // This chains: step1 → multiply(step1, 2), etc.
            await traceInFile(
              cs.returnCapture,
              currentFile,
              currentFunc,
              "forward",
              depth + 1,
              calleeInfo.filePath,
              "cross_file_return"
            )
          }

          // After forward cross-file trace completes for the callee,
          // check if ANY parameter was modified via pointer dereference
          // or reference assignment, and propagate edges back to the caller.
          // This handles:
          //   - int*& ref_ptr: alias = target (modifies caller's pointer variable)
          //   - int* ptr: *ptr = value (dereference write affects caller's memory)
          //   - int& ref: r = r + 1 (reference param assignment)
          // by checking ALL callee params, not just the one we entered via.
          if (isCrossFile && calleeInfo.filePath !== currentFile) {
            const calleeFileData = workspace.files.find(f => f.filePath === calleeInfo.filePath)
            const calleeFuncCfg = calleeFileData?.funcCfgs.get(cs.calleeFunc)

            if (calleeFuncCfg) {
              for (let pi = 0; pi < calleeCfg.params.length; pi++) {
                const calleeParam = calleeCfg.params[pi]
                const callerArg = pi < cs.argVars.length && cs.argVars[pi] ? cs.argVars[pi] : null
                if (!calleeParam || !callerArg) continue

                const paramWasModified = checkParamModifiedViaDeref(
                  calleeFuncCfg,
                  calleeParam,
                  calleeInfo.filePath
                )

                const paramDirectlyAssigned = checkParamDirectlyAssigned(
                  calleeFuncCfg,
                  calleeParam
                )

                if (paramDirectlyAssigned) {
                  const refModEdge: FlowEdge = {
                    fromVar: calleeParam,
                    fromLine: calleeFuncCfg.endLine,
                    fromStatement: `modified in ${cs.calleeFunc}()`,
                    fromFile: calleeInfo.filePath,
                    toVar: callerArg,
                    toLine: cs.line,
                    toStatement: `${cs.calleeFunc}(${cs.argVars.join(", ")})`,
                    toFile: currentFile,
                    edgeType: "cross_file_ref_modify",
                  }
                  allEdges.push(refModEdge)
                  crossFunctionEdges.push(refModEdge)
                  allVariablesSet.add(callerArg)

                } else if (paramWasModified) {
                  const derefEdge: FlowEdge = {
                    fromVar: calleeParam,
                    fromLine: calleeFuncCfg.endLine,
                    fromStatement: `modified in ${cs.calleeFunc}()`,
                    fromFile: calleeInfo.filePath,
                    toVar: callerArg,
                    toLine: cs.line,
                    toStatement: `${cs.calleeFunc}(${cs.argVars.join(", ")})`,
                    toFile: currentFile,
                    edgeType: "cross_file_deref",
                  }
                  allEdges.push(derefEdge)
                  crossFunctionEdges.push(derefEdge)
                  allVariablesSet.add(callerArg)

                }
              }
            }
          }
        } else if (!isCrossFile) {
          await traceInFile(
            paramName,
            currentFile,
            cs.calleeFunc,
            "forward",
            depth + 1,
            currentFile
          )

          // After forward tracing the callee: detect ref/pointer param side effects
          // in void functions (no returnCapture). The modified param flows back to
          // the caller's variable, enabling chained forward tracing.
          if (!cs.returnCapture) {
            const calleeFuncCfg = file.funcCfgs.get(cs.calleeFunc)
            if (calleeFuncCfg && calleeFuncCfg.duInfo.definitions.has(paramName)) {
              const refModEdge: FlowEdge = {
                fromVar: paramName,
                fromLine: calleeFuncCfg.endLine,
                fromStatement: `modified in ${cs.calleeFunc}()`,
                fromFile: currentFile,
                toVar: currentVar,
                toLine: cs.line,
                toStatement: `${cs.calleeFunc}() modifies ${currentVar}`,
                toFile: currentFile,
                edgeType: "ref_param_out",
              }
              allEdges.push(refModEdge)
              crossFunctionEdges.push(refModEdge)
              allVariablesSet.add(currentVar)
              // No further recursion needed — the outer loop at line 439 already
              // iterates over all call sites where argVars includes currentVar.
              // The ref_param_out edge documents the data flow; subsequent calls
              // in the chain (e.g., incrementRef after transformRef) are processed
              // naturally by the loop.
            }
          }
        }
      }
    }

    if ((currentDir === "backward" || currentDir === "both") && depth < maxDepth) {
      if (funcCfg.params.includes(currentVar)) {
        // First look for callers in the current file
        let callers = file.callSites.filter(cs => cs.calleeFunc === currentFunc)
        
        // If no local callers found (e.g. cross-file callee), search all files
        if (callers.length === 0) {
          for (const f of workspace.files) {
            if (f.filePath === currentFile) continue // already checked
            const found = f.callSites.filter(cs => cs.calleeFunc === currentFunc)
            callers.push(...found)
          }
        }

        for (const cs of callers) {
          const argIdx = funcCfg.params.indexOf(currentVar)
          if (argIdx >= 0 && argIdx < cs.argVars.length && cs.argVars[argIdx]) {
            const argVar = cs.argVars[argIdx]
            const isCrossFile = !workspace.files.find(f => f.filePath === currentFile)?.funcCfgs.has(cs.callerFunc)

            const callerInfo = workspace.globalFunctionRegistry.get(cs.callerFunc)

            const crossEdge: FlowEdge = {
              fromVar: argVar,
              fromLine: cs.line,
              fromStatement: `${cs.callerFunc}(${cs.argVars.join(", ")})`,
              fromFile: callerInfo?.filePath ?? currentFile,
              toVar: currentVar,
              toLine: funcCfg.startLine,
              toStatement: `param ${currentVar}`,
              toFile: currentFile,
              edgeType: isCrossFile ? "cross_file_call" : "parameter",
            }
            allEdges.push(crossEdge)
            if (isCrossFile) crossFunctionEdges.push(crossEdge)

            if (isCrossFile && callerInfo && callerInfo.filePath !== currentFile) {
              await traceInFile(
                argVar,
                callerInfo.filePath,
                cs.callerFunc,
                "backward",
                depth + 1,
                currentFile,
                "cross_file_call"
              )
            } else if (!isCrossFile) {
              await traceInFile(
                argVar,
                currentFile,
                cs.callerFunc,
                "backward",
                depth + 1,
                currentFile
              )
            }
          }
        }
      }

      // Handle backward trace through return captures (non-parameter variables)
      // e.g., backward trace from "res1" which captures return of processData(d1)
      const returnCaptureCalls = file.callSites.filter(
        cs => cs.callerFunc === currentFunc && cs.returnCapture === currentVar
      )
      for (const cs of returnCaptureCalls) {
        const calleeInfo = workspace.globalFunctionRegistry.get(cs.calleeFunc)
        if (!calleeInfo) continue

        const isCrossFile = calleeInfo.filePath !== currentFile

        // Create edge from callee's return back to currentVar
        const retEdge: FlowEdge = {
          fromVar: cs.calleeFunc,
          fromLine: calleeInfo.cfg.endLine,
          fromStatement: "return",
          fromFile: calleeInfo.filePath,
          toVar: currentVar,
          toLine: cs.line,
          toStatement: `= ${cs.calleeFunc}()`,
          toFile: currentFile,
          edgeType: isCrossFile ? "cross_file_return" : "return",
        }
        allEdges.push(retEdge)
        if (isCrossFile) crossFunctionEdges.push(retEdge)

        if (isCrossFile) {
          // Trace backward inside the callee: the return value flows from callee's params
          for (let i = 0; i < cs.argVars.length && i < calleeInfo.cfg.params.length; i++) {
            if (cs.argVars[i]) {
              await traceInFile(
                calleeInfo.cfg.params[i]!,
                calleeInfo.filePath,
                cs.calleeFunc,
                "backward",
                depth + 1,
                currentFile,
                "cross_file_return"
              )
            }
          }
        }
      }

      // Handle backward trace through side-effect parameter modification.
      // When a variable is passed as an argument to a cross-file function that
      // directly assigns to its reference parameter, the variable's value after
      // the call comes from within the function body. We trace backward from
      // other arguments to find the source.
      //
      // Example: createAlias(alias3, &target) with body "alias = target" (int*& alias)
      //   → alias3 is arg0, param alias is directly assigned via defVars
      //   → source of alias3's new value is 'target' param → caller's arg1 = &target
      //   → extract "target" from "&target" and continue backward trace
      if (!funcCfg.params.includes(currentVar)) {
        const argCalls = file.callSites.filter(
          cs => cs.callerFunc === currentFunc && cs.argVars.includes(currentVar)
        )

        for (const cs of argCalls) {
          const isCrossFile = !file.funcCfgs.has(cs.calleeFunc)
          if (!isCrossFile) continue

          const calleeInfo = workspace.globalFunctionRegistry.get(cs.calleeFunc)
          if (!calleeInfo || calleeInfo.filePath === currentFile) continue

          const argIdx = cs.argVars.indexOf(currentVar)
          if (argIdx < 0 || argIdx >= calleeInfo.cfg.params.length) continue
          const calleeParam = calleeInfo.cfg.params[argIdx]
          if (!calleeParam) continue

          // Check if the callee param was directly assigned (ref param modification)
          const calleeFileData = workspace.files.find(f => f.filePath === calleeInfo.filePath)
          const calleeFuncCfg = calleeFileData?.funcCfgs.get(cs.calleeFunc)
          if (!calleeFuncCfg) continue

          const paramDirectlyAssigned = checkParamDirectlyAssigned(calleeFuncCfg, calleeParam)
          if (!paramDirectlyAssigned) continue

          // This call modifies currentVar via reference param side effect.
          // Create edges from other arguments back to currentVar and trace backward.
          for (let otherIdx = 0; otherIdx < cs.argVars.length; otherIdx++) {
            if (otherIdx === argIdx) continue
            const otherArg = cs.argVars[otherIdx]
            if (!otherArg) continue

            // Strip address-of prefix (&) to get the actual variable name
            const sourceVar = otherArg.startsWith("&") ? otherArg.slice(1) : otherArg

            const sideEffectEdge: FlowEdge = {
              fromVar: sourceVar,
              fromLine: cs.line,
              fromStatement: `${cs.calleeFunc}(${cs.argVars.join(", ")})`,
              fromFile: currentFile,
              toVar: currentVar,
              toLine: cs.line,
              toStatement: `modified via ${cs.calleeFunc}() ref param`,
              toFile: currentFile,
              edgeType: "cross_file_side_effect",
            }
            allEdges.push(sideEffectEdge)
            crossFunctionEdges.push(sideEffectEdge)
            allVariablesSet.add(sourceVar)

            await traceInFile(
              sourceVar,
              currentFile,
              currentFunc,
              "backward",
              depth + 1,
              currentFile
            )
          }
        }
      }
    }
  }

  await traceInFile(varName, startFilePath, funcName, direction, 0)

  const allVariables = Array.from(allVariablesSet)

  return {
    edges: allEdges,
    allVariables,
    summary: `Cross-file trace: ${allEdges.length} edges, ${crossFunctionEdges.length} cross-file edges`,
    crossEdgesCount: crossFunctionEdges.length,
    crossFunctionEdges,
  }
}