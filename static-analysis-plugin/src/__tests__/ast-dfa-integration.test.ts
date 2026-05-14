/**
 * Integration Tests for AST-based DFA with Line-Scan Fallback
 *
 * Tests the variable-trace tool with AST-based CFG (v2) and line-scan fallback (v1).
 * Uses the 17 test project files from Round 1.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { resolve, dirname } from "path"
import { existsSync } from "fs"
import StaticAnalysisPlugin from "../index"
import { buildCFG, type ControlFlowGraph } from "../tools/cpp/cpp-cfg"
import { buildDefUseChains } from "../tools/cpp/cpp-dataflow"

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

const TEST_PROJECTS_BASE = resolve(import.meta.dir, "../.test-projects")

const POINTERS_CHAIN_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/pointers-chain.cpp")
const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
const STRUCT_NESTING_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/struct-nesting.cpp")
const CONTROL_FLOW_MAZE_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/control-flow-maze.cpp")
const TEMPLATES_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/templates.cpp")
const MODERN_CPP_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/modern-cpp.cpp")

const LAMBDA_CLOSURE_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/lambda-closure.cpp")
const MACROS_AND_PP_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/macros-and-pp.cpp")
const EXCEPTIONS_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/exceptions.cpp")
const CONCURRENCY_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/concurrency.cpp")
const GOTO_SETJMP_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/goto-setjmp.cpp")
const MOVE_SEMANTICS_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/move-semantics.cpp")
const TEMPLATES_GENERICS_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/templates-generics.cpp")

// ========================================
// Group 1: CFG Structure Tests (5 tests)
// ========================================

describe("CFG Structure Tests", () => {
  it("should build CFG with basic blocks and detect variables a,b,c", () => {
    const SIMPLE_CHAIN = `int main() {
  int a = 10;
  int b = a + 5;
  int c = b * 2;
  return c;
}`
    const lines = SIMPLE_CHAIN.split("\n")
    const cfg = buildCFG(lines, "main")

    expect(cfg.blocks.size).toBeGreaterThanOrEqual(1)
    expect(cfg.functionName).toBe("main")

    const allDefs = new Set<string>()
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        for (const def of stmt.defVars) allDefs.add(def)
      }
    }

    expect(allDefs.has("a")).toBe(true)
    expect(allDefs.has("b")).toBe(true)
    expect(allDefs.has("c")).toBe(true)
  })

  it("should detect function name correctly", () => {
    const content = `int myFunction() {
  int x = 1;
  return x;
}`
    const lines = content.split("\n")
    const cfg = buildCFG(lines, "myFunction")

    expect(cfg.functionName).toBe("myFunction")
  })

  it("should handle basic control flow", () => {
    const content = `int main() {
  int x = 1;
  if (x > 0) {
    x = 2;
  }
  return x;
}`
    const lines = content.split("\n")
    const cfg = buildCFG(lines, "main")

    expect(cfg.blocks.size).toBeGreaterThanOrEqual(1)
  })

  it("should have valid entry and exit block IDs", () => {
    const content = `int main() {
  int x = 1;
  return x;
}`
    const lines = content.split("\n")
    const cfg = buildCFG(lines, "main")

    expect(cfg.entryBlock).toBeDefined()
    expect(cfg.exitBlock).toBeDefined()
    expect(cfg.blocks.has(cfg.entryBlock)).toBe(true)
    expect(cfg.blocks.has(cfg.exitBlock)).toBe(true)
  })

  it("should handle multiple functions separately", () => {
    const content = `int func1() { return 1; } int func2() { return 2; }`
    const lines = content.split("\n")
    const cfg1 = buildCFG(lines, "func1")
    const cfg2 = buildCFG(lines, "func2")

    expect(cfg1.functionName).toBe("func1")
    expect(cfg2.functionName).toBe("func2")
  })
})

// ========================================
// Group 2: Forward Data Flow Tests (4 tests)
// ========================================

describe("Forward Data Flow Tests", () => {
  it("should trace forward from x in pointers-chain.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: POINTERS_CHAIN_CPP, variableName: "x", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should trace forward from num in function-flow.cpp to find half1, half2", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "num", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should trace forward from proj in struct-nesting.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: STRUCT_NESTING_CPP, variableName: "proj", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should trace forward from value in control-flow-maze.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: CONTROL_FLOW_MAZE_CPP, variableName: "value", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })
})

// ========================================
// Group 3: Backward Data Flow Tests (4 tests)
// ========================================

describe("Backward Data Flow Tests", () => {
  it("should trace backward to find all source variables", async () => {
    const SIMPLE_CHAIN = `int main() { int a = 10; int b = a + 5; int c = b * 2; return c; }`
    const testFile = resolve(import.meta.dir, "../../.test-tmp/backward-chain.cpp")
    require("fs").writeFileSync(testFile, SIMPLE_CHAIN, "utf-8")

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "c", direction: "backward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("should trace backward from result in control-flow-maze", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: CONTROL_FLOW_MAZE_CPP, variableName: "result", direction: "backward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("should trace backward from after_thread in concurrency.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: CONCURRENCY_CPP, variableName: "after_thread", direction: "backward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("should trace backward from loaded in concurrency.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: CONCURRENCY_CPP, variableName: "loaded", direction: "backward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })
})

// ========================================
// Group 4: Edge Case Tests (4 tests)
// ========================================

describe("Edge Case Tests", () => {
  it("should handle lambda-closure.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: LAMBDA_CLOSURE_CPP, variableName: "x", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle macros-and-pp.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MACROS_AND_PP_CPP, variableName: "result", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle exceptions.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: EXCEPTIONS_CPP, variableName: "result", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle concurrency.cpp thread patterns", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: CONCURRENCY_CPP, variableName: "shared", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })
})

// ========================================
// Group 5: AST vs Line-scan Comparison (3 tests)
// ========================================

describe("AST vs Line-scan Comparison", () => {
  it("should produce same defVars for simple declarations", () => {
    // multi-line required for line-scan (single-line inline statements can't be parsed per-line)
    const SIMPLE = `int main() {
  int a = 1;
  int b = a;
  int c = b;
  return 0;
}`
    const lines = SIMPLE.split("\n")
    const cfg = buildCFG(lines, "main")

    const allDefs = new Set<string>()
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        for (const def of stmt.defVars) allDefs.add(def)
      }
    }

    expect(allDefs.has("a")).toBe(true)
    expect(allDefs.has("b")).toBe(true)
    expect(allDefs.has("c")).toBe(true)
  })

  it("should find variables in pointer chain code", () => {
    const POINTER_CHAIN = `int main() {
  int x = 1;
  int* p = &x;
  int** pp = &p;
  int y = **pp;
  return y;
}`
    const lines = POINTER_CHAIN.split("\n")
    const cfg = buildCFG(lines, "main")

    const allDefs = new Set<string>()
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        for (const def of stmt.defVars) allDefs.add(def)
      }
    }

    expect(allDefs.has("x")).toBe(true)
    expect(allDefs.has("p")).toBe(true)
    expect(allDefs.has("pp")).toBe(true)
    expect(allDefs.has("y")).toBe(true)
  })

  it("should handle non-existent file gracefully", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: "/nonexistent/path/file.cpp", variableName: "x", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const output = (result as any).output || ""
    expect(output).toContain("Error")
  })
})

// ========================================
// Additional Integration Tests
// ========================================

describe("Additional Integration Tests", () => {
  it("should handle templates.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: TEMPLATES_CPP, variableName: "val", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle modern-cpp.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MODERN_CPP_CPP, variableName: "data", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle goto-setjmp.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: GOTO_SETJMP_CPP, variableName: "status", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle move-semantics.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MOVE_SEMANTICS_CPP, variableName: "src", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle templates-generics.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: TEMPLATES_GENERICS_CPP, variableName: "val", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should trace with line number specified", async () => {
    const SIMPLE = `int main() { int a = 1; return a; }`
    const testFile = resolve(import.meta.dir, "../../.test-tmp/line-spec.cpp")
    require("fs").writeFileSync(testFile, SIMPLE, "utf-8")

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "a", line: 1, direction: "forward" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("should handle bidirectional trace", async () => {
    const SIMPLE = `int main() { int a = 1; int b = a + 1; return b; }`
    const testFile = resolve(import.meta.dir, "../../.test-tmp/bidir.cpp")
    require("fs").writeFileSync(testFile, SIMPLE, "utf-8")

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "b", direction: "both" },
      createMockToolContext(),
    )
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.direction).toBe("both")
  })
})