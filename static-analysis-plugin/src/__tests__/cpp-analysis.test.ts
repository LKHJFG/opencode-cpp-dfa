/**
 * Tests for C++ Data Flow Analysis
 *
 * Tests the trace_variable tool with various C++ code patterns.
 * Uses the plugin's tool registration pattern for integration tests,
 * and unit tests for individual analysis modules.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { resolve, dirname } from "path"
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs"
import StaticAnalysisPlugin from "../index"
import { buildCFG, type ControlFlowGraph } from "../tools/cpp/cpp-cfg"
import { buildDefUseChains, analyzeDataFlow, traceForward, traceBackward } from "../tools/cpp/cpp-dataflow"

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
// Test helpers
// ========================================

const testDir = resolve(import.meta.dir, "../../.test-tmp")

function writeTestCppFile(name: string, content: string): string {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true })
  }
  const filePath = resolve(testDir, name)
  writeFileSync(filePath, content, "utf-8")
  return filePath
}

function cleanTestFiles() {
  if (existsSync(testDir)) {
    try {
      const files = require("fs").readdirSync(testDir)
      for (const f of files) {
        unlinkSync(resolve(testDir, f))
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

const SIMPLE_CHAIN_CPP = `int main() {
  int a = 10;
  int b = a + 5;
  int c = b * 2;
  return c;
}`

const POINTER_CPP = `int main() {
  int x = 42;
  int* p = &x;
  int y = *p;
  int z = y + 1;
  return z;
}`

const CONTROL_FLOW_CPP = `int main() {
  int x = 10;
  int y = 0;
  if (x > 5) {
    y = x * 2;
  } else {
    y = x / 2;
  }
  int z = y + 1;
  return z;
}`

const STRUCT_CPP = `struct Point {
  int x;
  int y;
};
int main() {
  Point p;
  p.x = 10;
  p.y = 20;
  int val = p.x;
  return val;
}`

// ========================================
// Unit Tests: CFG Builder
// ========================================

describe("buildCFG", () => {
  it("should build a CFG with basic blocks", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    expect(cfg.blocks.size).toBeGreaterThanOrEqual(1)
    expect(cfg.functionName).toBe("main")
  })

  it("should detect variable definitions", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")

    // Check that a is defined, b uses a, c uses b
    let foundA = false
    let foundB = false
    let foundC = false

    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.defVars.includes("a")) foundA = true
        if (stmt.defVars.includes("b")) foundB = true
        if (stmt.defVars.includes("c")) foundC = true
      }
    }

    expect(foundA).toBe(true)
    expect(foundB).toBe(true)
    expect(foundC).toBe(true)
  })

  it("should detect variable uses", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")

    let aUsedByB = false
    let bUsedByC = false

    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.defVars.includes("b") && stmt.useVars.includes("a")) aUsedByB = true
        if (stmt.defVars.includes("c") && stmt.useVars.includes("b")) bUsedByC = true
      }
    }

    expect(aUsedByB).toBe(true)
    expect(bUsedByC).toBe(true)
  })
})

// ========================================
// Unit Tests: DFA Engine
// ========================================

describe("buildDefUseChains", () => {
  it("should extract def-use info from CFG", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")

    expect(duInfo.definitions.has("a")).toBe(true)
    expect(duInfo.definitions.has("b")).toBe(true)
    expect(duInfo.definitions.has("c")).toBe(true)
    expect(duInfo.uses.has("a")).toBe(true)
    expect(duInfo.uses.has("b")).toBe(true)
    expect(duInfo.uses.has("c")).toBe(true) // c is used in return c;
  })
})

describe("traceForward", () => {
  it("should trace variable forward through assignment chain", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")
    const edges = traceForward(cfg, duInfo, "a")

    expect(edges.length).toBeGreaterThanOrEqual(2)

    // Should find: a → b → c
    const vars = new Set<string>()
    for (const e of edges) {
      vars.add(e.fromVar)
      vars.add(e.toVar)
    }
    expect(vars.has("a")).toBe(true)
    expect(vars.has("b")).toBe(true)
    expect(vars.has("c")).toBe(true)
  })

  it("should not find flow for undefined variable", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")
    const edges = traceForward(cfg, duInfo, "nonexistent")
    expect(edges.length).toBe(0)
  })
})

describe("traceBackward", () => {
  it("should trace variable backward through assignment chain", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")
    const edges = traceBackward(cfg, duInfo, "c")

    // Should find: c ← b ← a
    expect(edges.length).toBeGreaterThanOrEqual(1)

    const vars = new Set<string>()
    for (const e of edges) {
      vars.add(e.fromVar)
      vars.add(e.toVar)
    }
    // The chain from c backward: b → c, a → b
    // So fromVar should include b and a, toVar should include c and b
    expect(vars.has("c")).toBe(true)
  })
})

describe("analyzeDataFlow", () => {
  it("should analyze both directions", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")
    const result = analyzeDataFlow(cfg, duInfo, "b", undefined, "both", "test.cpp")

    expect(result.startVariable).toBe("b")
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    expect(result.allVariables.length).toBeGreaterThanOrEqual(2)

    // b is in the flow
    expect(result.allVariables.includes("b")).toBe(true)
  })

  it("should handle unknown variable gracefully", () => {
    const lines = SIMPLE_CHAIN_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")
    const result = analyzeDataFlow(cfg, duInfo, "unknownVar", undefined, "both", "test.cpp")

    expect(result.edges.length).toBe(0)
    expect(result.summary).toContain("not found")
  })
})

// ========================================
// Integration Tests: Plugin Tool Registration
// ========================================

describe("trace_variable tool registration", () => {
  it("should be registered in the plugin", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    expect(hooks.tool?.trace_variable).toBeDefined()
  })

  it("should have required args schema", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    expect(tool).toBeDefined()

    // Test execute with mock args to check it handles errors
    const result = await tool.execute(
      { filePath: "/nonexistent/test.cpp", variableName: "x" },
      createMockToolContext(),
    )
    // Should handle missing file gracefully
    expect(result).toBeDefined()
  })
})

// ========================================
// Integration Tests: Variable Trace Execution
// ========================================

describe("trace_variable execution", () => {
  let testFile: string

  beforeAll(() => {
    cleanTestFiles()
    testFile = writeTestCppFile("simple-chain.cpp", SIMPLE_CHAIN_CPP)
  })

  it("should trace variable forward", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "a", direction: "forward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.variableName).toBe("a")
    expect(meta.direction).toBe("forward")
    expect(meta.filePath).toBe(testFile)
  })

  it("should trace variable backward", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "c", direction: "backward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.variableName).toBe("c")
  })

  it("should trace bidirectionally", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "b", direction: "both" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.variableName).toBe("b")
    expect(Array.isArray(meta.allVariables)).toBe(true)
  })

  it("should handle non-existent variable", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "nonexistent", direction: "both" },
      createMockToolContext(),
    )
    const metadata = (result as any).metadata
    if (metadata && metadata.edges) {
      expect(metadata.edges.length).toBe(0)
    }
    // Should not crash
    expect(result).toBeDefined()
  })

  it("should handle non-existent file gracefully", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: "/nonexistent/path/file.cpp", variableName: "x" },
      createMockToolContext(),
    )
    const output = typeof result === "string" ? result : (result as any).output || ""
    expect(output).toContain("Error")
  })
})

// ========================================
// Edge Cases
// ========================================

describe("edge cases", () => {
  it("should handle empty file", async () => {
    const emptyFile = writeTestCppFile("empty.cpp", "")
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: emptyFile, variableName: "x" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle pointer-related code", () => {
    const lines = POINTER_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")

    // x should be defined and used
    expect(duInfo.definitions.has("x")).toBe(true)
    // p should be defined
    expect(duInfo.definitions.has("p")).toBe(true)
  })

  it("should handle control flow code", () => {
    const lines = CONTROL_FLOW_CPP.split("\n")
    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, "test.cpp")

    expect(duInfo.definitions.has("x")).toBe(true)
    expect(duInfo.definitions.has("y")).toBe(true)
    expect(duInfo.definitions.has("z")).toBe(true)
  })
})
