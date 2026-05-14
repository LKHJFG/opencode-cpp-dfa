/**
 * C++ Parser Module
 *
 * Uses web-tree-sitter (WASM) to parse C++ source files into AST trees.
 * No native compilation needed — runs entirely in WASM.
 */

import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

// web-tree-sitter types (imported for JSDoc references only)
// Using any for runtime types to avoid module resolution issues

// ============================================================
// Type Definitions
// ============================================================

export interface SourceLocation {
  row: number
  column: number
}

export interface ASTNodeInfo {
  type: string
  text: string
  startPosition: SourceLocation
  endPosition: SourceLocation
  children: ASTNodeInfo[]
}

export interface FunctionInfo {
  name: string
  line: number
  column: number
  text: string
  returnType: string
  parameters: string
}

export interface VariableInfo {
  name: string
  type: string | null
  line: number
  column: number
  text: string
  isPointer: boolean
  isArray: boolean
  isParameter: boolean
}

export interface AssignmentInfo {
  target: string // LHS variable(s)
  value: string // RHS expression text
  line: number
  column: number
  text: string
  operator: string // =, +=, -=, etc.
}

export interface FunctionCallInfo {
  name: string
  arguments: string[]
  line: number
  column: number
  text: string
}

export interface ClassInfo {
  name: string
  kind: "class" | "struct" | "union"
  line: number
  text: string
}

export interface ParserResult {
  tree: any
  sourceLines: string[]
  filePath: string
}

// ============================================================
// CppParser — Singleton WASM-based C++ Parser
// ============================================================

export class CppParser {
  private static instance: CppParser | null = null
  private parser: any = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  private constructor() {}

  static getInstance(): CppParser {
    if (!CppParser.instance) {
      CppParser.instance = new CppParser()
    }
    return CppParser.instance
  }

  /**
   * Initialize the parser. Loads web-tree-sitter WASM and C++ grammar.
   * Safe to call multiple times — subsequent calls return immediately.
   */
  async init(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    try {
      const { Parser, Language } = await import("web-tree-sitter")

      const wasmPaths = this.resolveWasmPaths()

      await Parser.init({
        locateFile: () => wasmPaths.parser,
      })

      this.parser = new Parser()

      const cppLanguage = await Language.load(wasmPaths.cpp)

      this.parser.setLanguage(cppLanguage)
      this.initialized = true
    } catch (err) {
      this.initialized = false
      this.initPromise = null
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to initialize C++ parser: ${message}`)
    }
  }

  private resolveWasmPaths(): { parser: string; cpp: string } {
    const candidates: string[] = []

    const pluginDir = import.meta.dir
      ? resolve(import.meta.dir, "..")
      : resolve(process.cwd(), "static-analysis-plugin")

    candidates.push(resolve(pluginDir, "node_modules/web-tree-sitter/web-tree-sitter.wasm"))

    candidates.push(resolve(process.cwd(), "node_modules/web-tree-sitter/web-tree-sitter.wasm"))

    if (import.meta.dir) {
      let dir = import.meta.dir
      while (dir !== resolve(dir, "..")) {
        const nmPath = resolve(dir, "node_modules/web-tree-sitter/web-tree-sitter.wasm")
        candidates.push(nmPath)
        dir = resolve(dir, "..")
      }
    }

    const parserPath = candidates.find((p) => existsSync(p))
    if (!parserPath) {
      throw new Error(
        `Could not locate web-tree-sitter.wasm. Searched:\n${candidates.map((p) => `  - ${p}`).join("\n")}`
      )
    }

    // Derive node_modules/ from the found parser WASM path
    // parser WASM is at: {someDir}/node_modules/web-tree-sitter/web-tree-sitter.wasm
    // Go up 2 levels to get node_modules/, then into tree-sitter-cpp/
    const cppCandidates: string[] = []
    const nmDir = resolve(parserPath, "../..")

    cppCandidates.push(resolve(nmDir, "tree-sitter-cpp/tree-sitter-cpp.wasm"))
    // Also try alongside the parser WASM as fallback
    cppCandidates.push(resolve(parserPath, "../tree-sitter-cpp/tree-sitter-cpp.wasm"))

    const cppPath = cppCandidates.find((p) => existsSync(p))
    if (!cppPath) {
      throw new Error(
        `Could not locate tree-sitter-cpp.wasm. Searched:\n${cppCandidates.map((p) => `  - ${p}`).join("\n")}\n` +
        `(parser was found at: ${parserPath})`
      )
    }

    return { parser: parserPath, cpp: cppPath }
  }

  /**
   * Check if parser is initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Parse a C++ source file from disk.
   */
  async parseFile(filePath: string): Promise<ParserResult> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    await this.init()

    const content = readFileSync(filePath, "utf-8")
    return this.parseContent(content, filePath)
  }

  /**
   * Parse C++ source code from a string.
   */
  async parseContent(content: string, filePath: string = "<unknown>"): Promise<ParserResult> {
    await this.init()

    const tree = this.parser.parse(content)
    const sourceLines = content.split("\n")

    return {
      tree,
      sourceLines,
      filePath,
    }
  }

  /**
   * Reset the singleton (useful for testing).
   */
  static reset(): void {
    CppParser.instance = null
  }
}

// ============================================================
// AST Helper Functions
// ============================================================

/**
 * Walk all nodes in a tree-sitter AST and collect those matching a predicate.
 */
function walkTree(node: any, predicate: (n: any) => boolean): any[] {
  const results: any[] = []
  function walk(n: any) {
    if (predicate(n)) {
      results.push(n)
    }
    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i))
    }
  }
  walk(node)
  return results
}

/**
 * Get text of a tree-sitter node safely.
 */
function getNodeText(node: any): string {
  return node.text ?? ""
}

/**
 * Extract function definitions from a parsed C++ AST.
 */
export function getFunctionDefinitions(tree: any, sourceLines: string[]): FunctionInfo[] {
  const results: FunctionInfo[] = []

  const funcNodes = walkTree(tree.rootNode, (n: any) => {
    return n.type === "function_definition"
  })

  for (const node of funcNodes) {
    // Find function declarator (contains name)
    const declarator = findChild(node, "function_declarator")
    const name = declarator ? extractFunctionName(declarator) : "(anonymous)"

    // Find return type
    const typeNode = findChild(node, "primitive_type") || findChild(node, "type_identifier") || findChild(node, "qualified_identifier")
    const returnType = typeNode ? getNodeText(typeNode) : "auto"

    // Find parameters
    const params = declarator ? extractParameters(declarator) : ""

    const startPos = node.startPosition

    results.push({
      name,
      line: startPos.row + 1,
      column: startPos.column,
      text: getNodeText(node),
      returnType,
      parameters: params,
    })
  }

  return results
}

function findChild(node: any, type: string): any | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i)
    if (child.type === type) return child
    // Search recursively in named children
    const found = findChildInTree(child, type)
    if (found) return found
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

function extractFunctionName(declarator: any): string {
  // Try direct identifier
  const id = findChild(declarator, "identifier") || findChild(declarator, "field_identifier")
  if (id) return getNodeText(id)

  // Try nested declarator (e.g., function pointer or qualifier)
  for (let i = 0; i < declarator.namedChildCount; i++) {
    const child = declarator.namedChild(i)
    const nested = findChild(child, "identifier") || findChild(child, "field_identifier")
    if (nested) return getNodeText(nested)
  }

  return "(anonymous)"
}

function extractParameters(declarator: any): string {
  const params = findChild(declarator, "parameter_list")
  if (!params) return ""
  return getNodeText(params)
}

/**
 * Extract variable declarations from a parsed C++ AST.
 */
export function getVariableDeclarations(tree: any, sourceLines: string[]): VariableInfo[] {
  const results: VariableInfo[] = []

  // Find declaration nodes
  const declNodes = walkTree(tree.rootNode, (n: any) => {
    return n.type === "declaration"
  })

  for (const node of declNodes) {
    const typeNode = findChild(node, "primitive_type") || 
                     findChild(node, "type_identifier") || 
                     findChild(node, "qualified_identifier") ||
                     findChild(node, "sized_type_specifier")
    const typeName = typeNode ? getNodeText(typeNode) : null

    const declarators = walkTree(node, (n: any) => n.type === "init_declarator" || n.type === "array_declarator")
    
    for (const decl of declarators) {
      // Find the identifier in this declarator
      const idNodes = walkTree(decl, (n: any) => n.type === "identifier")
      for (const id of idNodes) {
        const text = getNodeText(decl)
        const startPos = id.startPosition
        const isPointer = text.includes("*")
        const isArray = decl.type === "array_declarator" || text.includes("[")

        results.push({
          name: getNodeText(id),
          type: typeName,
          line: startPos.row + 1,
          column: startPos.column,
          text: text,
          isPointer,
          isArray,
          isParameter: false,
        })
      }
    }
  }

  // Also find parameters from function definitions
  const funcDefs = walkTree(tree.rootNode, (n: any) => n.type === "function_definition")
  for (const funcDef of funcDefs) {
    const declarator = findChild(funcDef, "function_declarator")
    if (!declarator) continue

    const params = findChild(declarator, "parameter_list")
    if (!params) continue

    for (let i = 0; i < params.namedChildCount; i++) {
      const param = params.namedChild(i)
      if (param.type === "parameter_declaration") {
        const paramType = findChild(param, "primitive_type") || findChild(param, "type_identifier")
        const paramId = findChild(param, "identifier")
        if (paramId) {
          const startPos = paramId.startPosition
          results.push({
            name: getNodeText(paramId),
            type: paramType ? getNodeText(paramType) : null,
            line: startPos.row + 1,
            column: startPos.column,
            text: getNodeText(param),
            isPointer: getNodeText(param).includes("*"),
            isArray: getNodeText(param).includes("["),
            isParameter: true,
          })
        }
      }
    }
  }

  // Deduplicate by name+line
  const seen = new Set<string>()
  return results.filter((v) => {
    const key = `${v.name}:${v.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Extract assignment expressions from a parsed C++ AST.
 */
export function getAssignmentExpressions(tree: any, sourceLines: string[]): AssignmentInfo[] {
  const results: AssignmentInfo[] = []

  // Find assignment_expression nodes
  const assignNodes = walkTree(tree.rootNode, (n: any) => {
    return n.type === "assignment_expression"
  })

  for (const node of assignNodes) {
    const text = getNodeText(node)
    const startPos = node.startPosition

    // The LHS is typically the first child
    const lhs = node.namedChild(0)
    const lhsText = lhs ? getNodeText(lhs) : ""

    // The operator is the second child
    const op = node.childCount > 1 ? node.child(1) : null
    const opText = op ? getNodeText(op) : "="

    // The RHS is typically the last child
    const rhs = node.namedChild(node.namedChildCount - 1)
    const rhsText = rhs ? getNodeText(rhs) : ""

    results.push({
      target: lhsText,
      value: rhsText,
      line: startPos.row + 1,
      column: startPos.column,
      text,
      operator: opText,
    })
  }

  return results
}

/**
 * Extract function call expressions from a parsed C++ AST.
 */
export function getFunctionCalls(tree: any): FunctionCallInfo[] {
  const results: FunctionCallInfo[] = []

  const callNodes = walkTree(tree.rootNode, (n: any) => {
    return n.type === "call_expression"
  })

  for (const node of callNodes) {
    const text = getNodeText(node)
    const startPos = node.startPosition

    // The function name is typically the first child (identifier or field_expression)
    const funcNode = node.namedChild(0)
    const name = funcNode ? getNodeText(funcNode) : ""

    // Arguments are in argument_list child
    const argList = findChild(node, "argument_list")
    const args: string[] = []
    if (argList) {
      for (let i = 0; i < argList.namedChildCount; i++) {
        args.push(getNodeText(argList.namedChild(i)))
      }
    }

    results.push({
      name,
      arguments: args,
      line: startPos.row + 1,
      column: startPos.column,
      text,
    })
  }

  return results
}

/**
 * Extract class/struct definitions from a parsed C++ AST.
 */
export function getClassDefinitions(tree: any): ClassInfo[] {
  const results: ClassInfo[] = []

  const classNodes = walkTree(tree.rootNode, (n: any) => {
    return n.type === "class_specifier" || n.type === "struct_specifier" || n.type === "union_specifier"
  })

  for (const node of classNodes) {
    const nameNode = findChild(node, "identifier") || findChild(node, "type_identifier")
    const name = nameNode ? getNodeText(nameNode) : "(anonymous)"
    const startPos = node.startPosition

    const kindMap: Record<string, "class" | "struct" | "union"> = {
      class_specifier: "class",
      struct_specifier: "struct",
      union_specifier: "union",
    }

    results.push({
      name,
      kind: kindMap[node.type] ?? "class",
      line: startPos.row + 1,
      text: getNodeText(node),
    })
  }

  return results
}
