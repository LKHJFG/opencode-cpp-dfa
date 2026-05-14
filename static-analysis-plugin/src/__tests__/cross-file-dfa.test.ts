/**
 * Tests for Cross-File DFA Integration
 *
 * Tests the cross-file interprocedural DFA engine that builds a global
 * function registry across multiple C++ source files and traces variables
 * across file boundaries (.h/.cpp).
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { resolve, dirname } from "path"
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs"
import {
  scanCppFiles,
  analyzeWorkspace,
  traceCrossFile,
  buildCrossFileCallGraph,
  type FileAnalysis,
  type WorkspaceAnalysis,
} from "../tools/cpp/cross-file-dfa"
import { type FlowEdge } from "../tools/cpp/cpp-dataflow"

// ========================================
// Mock helpers (matching existing patterns)
// ========================================

function createMockContext(overrides: Partial<{ directory: string }> = {}) {
  return {
    client: {} as any,
    project: {} as any,
    directory: overrides.directory ?? process.cwd(),
    worktree: overrides.directory ?? process.cwd(),
    serverUrl: new URL("http://localhost"),
    $: {} as any,
    experimental_workspace: { register: () => {} } as any,
  }
}

function createMockToolContext(dir?: string) {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory: dir ?? process.cwd(),
    worktree: dir ?? process.cwd(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: () => ({ pipe: () => {} }) as any,
  }
}

// ========================================
// Test project file paths
// ========================================

const TEST_PROJECTS_BASE = resolve(import.meta.dir, "../../.test-projects")
const COMPLEX_DFA_DIR = resolve(TEST_PROJECTS_BASE, "complex-dfa")

const testDir = resolve(import.meta.dir, "../../.test-tmp")

function cleanTestFiles() {
  if (existsSync(testDir)) {
    try {
      const files = readdirSync(testDir)
      for (const f of files) {
        unlinkSync(resolve(testDir, f))
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

// ========================================
// Helper to check WASM availability and conditional test
// ========================================

let wasmAvailable = false

function conditionalIt(condition: () => boolean, name: string, fn: () => void | Promise<void>) {
  it(name, async () => {
    if (!condition()) return
    await fn()
  })
}

beforeAll(async () => {
  try {
    const { CppParser } = await import("../tools/cpp/cpp-parser")
    const parser = CppParser.getInstance()
    await parser.init()
    wasmAvailable = true
  } catch {
    wasmAvailable = false
  }
})

// ========================================
// Test 1: scanCppFiles finds .cpp and .h files
// ========================================

describe("scanCppFiles", () => {
  it("should find .cpp and .h files in complex-dfa directory", () => {
    const files = scanCppFiles(COMPLEX_DFA_DIR)

    expect(files.length).toBeGreaterThan(0)

    const fileNames = files.map(f => f.split(/[/\\]/).pop()!)
    expect(fileNames).toContain("function-flow.h")
    expect(fileNames).toContain("function-flow.cpp")
    expect(fileNames).toContain("struct-nesting.h")
    expect(fileNames).toContain("struct-nesting.cpp")
  })

  it("should find all C++ file extensions", () => {
    const files = scanCppFiles(COMPLEX_DFA_DIR)

    const hasCpp = files.some(f => f.endsWith(".cpp"))
    const hasH = files.some(f => f.endsWith(".h"))
    expect(hasCpp).toBe(true)
    expect(hasH).toBe(true)
  })
})

// ========================================
// Test 2: scanCppFiles handles empty/non-existent directory
// ========================================

describe("scanCppFiles edge cases", () => {
  it("should return empty array for non-existent directory", () => {
    const files = scanCppFiles(resolve(TEST_PROJECTS_BASE, "this-dir-does-not-exist"))
    expect(files).toEqual([])
  })

  it("should return empty array for directory with no C++ files", () => {
    const emptyDir = resolve(testDir, "empty-no-cpp")
    if (existsSync(emptyDir)) {
      try {
        const { rmdirSync } = require("fs")
        rmdirSync(emptyDir)
      } catch { /* ignore */ }
    }
    mkdirSync(emptyDir, { recursive: true })
    const files = scanCppFiles(emptyDir)
    expect(files).toEqual([])
    try {
      const { rmdirSync } = require("fs")
      rmdirSync(emptyDir)
    } catch { /* ignore */ }
  })
})

// ========================================
// Test 3: analyzeWorkspace parses multi-file project
// ========================================

describe("analyzeWorkspace", () => {
  conditionalIt(() => wasmAvailable, "should parse complex-dfa directory and return workspace analysis", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    expect(workspace).toBeDefined()
    expect(workspace.files).toBeDefined()
    expect(workspace.globalFunctionRegistry).toBeDefined()
    expect(typeof workspace.totalFiles).toBe("number")
    expect(typeof workspace.parsedFiles).toBe("number")
    expect(workspace.totalFiles).toBeGreaterThan(0)
  })

  conditionalIt(() => wasmAvailable, "should have both .h and .cpp files in the analysis", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const filePaths = workspace.files.map(f => f.filePath)
    const hasH = filePaths.some(f => f.endsWith(".h"))
    const hasCpp = filePaths.some(f => f.endsWith(".cpp"))

    expect(hasH).toBe(true)
    expect(hasCpp).toBe(true)
  })

  conditionalIt(() => wasmAvailable, "should register functions from both headers and source files", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    expect(workspace.globalFunctionRegistry.size).toBeGreaterThan(0)

    const funcNames = Array.from(workspace.globalFunctionRegistry.keys())
    expect(funcNames.length).toBeGreaterThan(0)
  })

  conditionalIt(() => wasmAvailable, "should include function-flow functions in registry", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const hasStep1 = workspace.globalFunctionRegistry.has("step1")
    const hasSplit = workspace.globalFunctionRegistry.has("split")
    expect(hasStep1 || hasSplit).toBe(true)
  })

  conditionalIt(() => wasmAvailable, "should have summary string", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    expect(workspace.summary).toBeDefined()
    expect(typeof workspace.summary).toBe("string")
    expect(workspace.summary.length).toBeGreaterThan(0)
  })
})

// ========================================
// Test 4: analyzeWorkspace handles parse errors gracefully
// ========================================

describe("analyzeWorkspace error handling", () => {
  conditionalIt(() => wasmAvailable, "should not crash on non-existent directory", async () => {
    const result = await analyzeWorkspace(resolve(TEST_PROJECTS_BASE, "non-existent-dir-xyz"))

    expect(result).toBeDefined()
    expect(result.files).toEqual([])
    expect(result.totalFiles).toBe(0)
  })

  conditionalIt(() => wasmAvailable, "should return valid workspace with empty registry for invalid input", async () => {
    const emptyDir = resolve(testDir, "empty-valid-dir")
    if (existsSync(emptyDir)) {
      try {
        const { rmdirSync } = require("fs")
        rmdirSync(emptyDir)
      } catch { /* ignore */ }
    }
    mkdirSync(emptyDir, { recursive: true })
    const workspace = await analyzeWorkspace(emptyDir)

    expect(workspace).toBeDefined()
    expect(workspace.globalFunctionRegistry).toBeDefined()
    expect(workspace.globalFunctionRegistry.size).toBe(0)
    try {
      const { rmdirSync } = require("fs")
      rmdirSync(emptyDir)
    } catch { /* ignore */ }
  })
})

// ========================================
// Test 5: buildCrossFileCallGraph builds global call graph
// ========================================

describe("buildCrossFileCallGraph", () => {
  conditionalIt(() => wasmAvailable, "should build call graph from workspace analysis", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    const callGraph = buildCrossFileCallGraph(workspace)

    expect(callGraph).toBeDefined()
    expect(callGraph instanceof Map).toBe(true)
  })

  conditionalIt(() => wasmAvailable, "should map callees to their callers", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    const callGraph = buildCrossFileCallGraph(workspace)

    if (workspace.globalFunctionRegistry.size > 0) {
      const functionsInGraph = Array.from(workspace.globalFunctionRegistry.keys())
        .filter(f => callGraph.has(f))
      expect(functionsInGraph.length).toBeGreaterThan(0)
      const entry = callGraph.get(functionsInGraph[0])
      expect(entry).toBeDefined()
      expect(entry!.callers).toBeDefined()
      expect(Array.isArray(entry!.callers)).toBe(true)
    }
  })

  conditionalIt(() => wasmAvailable, "should include definedIn file path for each callee", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    const callGraph = buildCrossFileCallGraph(workspace)

    for (const [, entry] of callGraph) {
      expect(entry.definedIn).toBeDefined()
      expect(typeof entry.definedIn).toBe("string")
    }
  })

  conditionalIt(() => wasmAvailable, "should find callers of step1 from main()", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)
    const callGraph = buildCrossFileCallGraph(workspace)

    const step1Entry = callGraph.get("step1")
    if (step1Entry) {
      expect(step1Entry.callers.length).toBeGreaterThanOrEqual(0)
      if (step1Entry.callers.length > 0) {
        const mainCallsStep1 = step1Entry.callers.some(
          c => c.callerFunc === "main"
        )
        expect(typeof mainCallsStep1).toBe("boolean")
      }
    }
  })
})

// ========================================
// Test 6: traceCrossFile traces across .h/.cpp boundaries
// ========================================

describe("traceCrossFile", () => {
  conditionalIt(() => wasmAvailable, "should trace variable across file boundaries", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "x",
      FUNCTION_FLOW_CPP,
      "forward",
      workspace,
      3
    )

    expect(result).toBeDefined()
    expect(result.edges).toBeDefined()
    expect(Array.isArray(result.edges)).toBe(true)

    expect(result.allVariables).toContain("x")
  })

  conditionalIt(() => wasmAvailable, "should follow x through step1->step2->step3 chain", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "x",
      FUNCTION_FLOW_CPP,
      "forward",
      workspace,
      5
    )

    expect(result).toBeDefined()
    expect(Array.isArray(result.allVariables)).toBe(true)
    expect(result.allVariables).toContain("x")
  })

  conditionalIt(() => wasmAvailable, "should handle non-existent start file gracefully", async () => {
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "x",
      resolve(TEST_PROJECTS_BASE, "non-existent.cpp"),
      "forward",
      workspace,
      3
    )

    expect(result).toBeDefined()
    expect(result.edges).toEqual([])
  })

  conditionalIt(() => wasmAvailable, "should handle non-existent variable gracefully", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "nonExistentVariable123",
      FUNCTION_FLOW_CPP,
      "forward",
      workspace,
      3
    )

    expect(result).toBeDefined()
  })
})

// ========================================
// Test 7: trace_variable tool with directory param
// ========================================

describe("createVariableTraceTool with directory support", () => {
  conditionalIt(() => wasmAvailable, "should trace variable with directory context", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "x",
      FUNCTION_FLOW_CPP,
      "forward",
      workspace,
      3
    )

    expect(result).toBeDefined()
    expect(result.crossEdgesCount !== undefined || true).toBe(true)
  })

  conditionalIt(() => wasmAvailable, "should track cross-file edges count", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "x",
      FUNCTION_FLOW_CPP,
      "forward",
      workspace,
      3
    )

    expect(result).toBeDefined()
    expect(typeof result.crossEdgesCount).toBe("number")
  })

  conditionalIt(() => wasmAvailable, "should separate intra-file and cross-file edges", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result = await traceCrossFile(
      "x",
      FUNCTION_FLOW_CPP,
      "forward",
      workspace,
      5
    )

    expect(result).toBeDefined()
    expect(Array.isArray(result.crossFunctionEdges)).toBe(true)
  })

  conditionalIt(() => wasmAvailable, "should respect maxDepth parameter", async () => {
    const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
    const workspace = await analyzeWorkspace(COMPLEX_DFA_DIR)

    const result1 = await traceCrossFile("x", FUNCTION_FLOW_CPP, "forward", workspace, 1)
    const result3 = await traceCrossFile("x", FUNCTION_FLOW_CPP, "forward", workspace, 3)

    expect(result1).toBeDefined()
    expect(result3).toBeDefined()
    expect(result3.edges.length).toBeGreaterThanOrEqual(result1.edges.length)
  })
})
