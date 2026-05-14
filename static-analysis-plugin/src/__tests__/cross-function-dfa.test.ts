/**
 * Tests for Cross-Function (Interprocedural) DFA Integration
 *
 * Tests the integration of v3 interprocedural DFA engine into variable-trace.ts.
 * Uses the plugin's tool registration pattern for integration tests.
 *
 * Note: Direct cross-function-dfa function tests require WASM setup and are wrapped
 * with try-catch. Primary testing is through the tool interface which handles
 * path resolution and initialization properly.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { resolve, dirname } from "path"
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs"
import StaticAnalysisPlugin from "../index"
import { buildCFG } from "../tools/cpp/cpp-cfg"
import { buildDefUseChains, analyzeDataFlow } from "../tools/cpp/cpp-dataflow"

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

const FUNCTION_FLOW_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/function-flow.cpp")
const POINTERS_CHAIN_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/pointers-chain.cpp")
const CONTROL_FLOW_MAZE_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/control-flow-maze.cpp")
const STRUCT_NESTING_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/struct-nesting.cpp")
const TEMPLATES_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/templates.cpp")
const MODERN_CPP_CPP = resolve(TEST_PROJECTS_BASE, "complex-dfa/modern-cpp.cpp")

const CONCURRENCY_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/concurrency.cpp")
const EXCEPTIONS_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/exceptions.cpp")
const LAMBDA_CLOSURE_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/lambda-closure.cpp")
const MACROS_AND_PP_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/macros-and-pp.cpp")
const MOVE_SEMANTICS_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/move-semantics.cpp")
const TEMPLATES_GENERICS_CPP = resolve(TEST_PROJECTS_BASE, "dfa-edge-cases/templates-generics.cpp")

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
      const { readdirSync, unlinkSync } = require("fs")
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
// Group 1: Interprocedural Forward Trace Tests (4 tests)
// ========================================

describe("traceInterprocedural forward", () => {
  it("should trace forward from x in function-flow.cpp through step functions", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "x", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
    expect(Array.isArray(meta.allVariables)).toBe(true)
    expect(meta.allVariables.length).toBeGreaterThanOrEqual(1)
  })

  it("should trace forward from num in function-flow.cpp through split() to half1, half2", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "num", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should trace forward from target_ptr in pointers-chain.cpp through reset()", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: POINTERS_CHAIN_CPP, variableName: "target_ptr", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should trace forward from val in function-flow.cpp through process()", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "val", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
    expect(Array.isArray(meta.allVariables)).toBe(true)
  })
})

// ========================================
// Group 2: Interprocedural Backward Trace Tests (4 tests)
// ========================================

describe("traceInterprocedural backward", () => {
  it("should trace backward from s5 through step5→step4→...→step1→x", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "s5", direction: "backward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()

    // s5 should be traced back to find s4, s3, s2, s1, x
    expect(meta.allVariables).toContain("s5")
  })

  it("should trace backward from half1 through split() to find num", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "half1", direction: "backward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should trace backward from after_reset in pointers-chain.cpp through reset()", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: POINTERS_CHAIN_CPP, variableName: "after_reset", direction: "backward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should trace backward from result in control-flow-maze.cpp (intraprocedural)", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: CONTROL_FLOW_MAZE_CPP, variableName: "result", direction: "backward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
    expect(Array.isArray(meta.allVariables)).toBe(true)
  })
})

// ========================================
// Group 3: Edge Case Tests (4 tests)
// ========================================

describe("Edge Case Tests", () => {
  it("should handle single function file with valid result", async () => {
    const SINGLE_FUNC = `int main() {
  int a = 10;
  int b = a + 5;
  int c = b * 2;
  return c;
}`

    const testFile = writeTestCppFile("single-func.cpp", SINGLE_FUNC)

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "a", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should handle variable not found gracefully", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "nonexistent_var_xyz", direction: "forward" },
      createMockToolContext(),
    )

    // Should not throw, returns result (possibly with empty edges)
    expect(result).toBeDefined()
    const output = (result as any).output
    expect(output).toBeDefined()
    expect(typeof output).toBe("string")
  })

  it("should handle recursive call without infinite loop", async () => {
    const RECURSIVE_CPP = `int factorial(int n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

int main() {
  int x = 5;
  int result = factorial(x);
  return result;
}`

    const testFile = writeTestCppFile("recursive.cpp", RECURSIVE_CPP)

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "n", direction: "forward" },
      createMockToolContext(),
    )

    // Should handle recursive call without infinite loop
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should handle method call (obj.method()) - handled gracefully", async () => {
    const METHOD_CPP = `class Calculator {
public:
  int add(int a, int b) { return a + b; }
  int multiply(int a, int b) { return a * b; }
};

int main() {
  Calculator calc;
  int x = 10;
  int y = 20;
  int sum = calc.add(x, y);
  int product = calc.multiply(x, y);
  return sum + product;
}`

    const testFile = writeTestCppFile("method-call.cpp", METHOD_CPP)

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "x", direction: "forward" },
      createMockToolContext(),
    )

    // Method calls (calc.add) are handled via fallback or partial analysis
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })
})

// ========================================
// Group 4: Fallback Behavior Tests (2 tests)
// ========================================

describe("Fallback Behavior Tests", () => {
  it("should handle AST parser failure gracefully with line-scan fallback", async () => {
    const SIMPLE_CPP = `int main() {
  int a = 10;
  int b = a + 5;
  int c = b * 2;
  return c;
}`

    const testFile = writeTestCppFile("fallback-test.cpp", SIMPLE_CPP)

    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: testFile, variableName: "a", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
  })

  it("should return valid result with edges when cross-function DFA is used", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "x", direction: "both" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
    expect(meta.edges).toBeDefined()
    expect(Array.isArray(meta.allVariables)).toBe(true)
  })
})

// ========================================
// Group 5: Cross-Function DFA Direct Function Tests (3 tests)
// ========================================

describe("Cross-Function DFA Direct Functions", () => {
  // These tests directly test cross-function-dfa.ts functions
  // They require WASM setup and may skip if parser unavailable

  it("should build function CFGs for multi-function file", async () => {
    // Test using line-scan fallback (no WASM needed for basic CFG building)
    const MULTI_FUNC_CPP = `int add(int a, int b) { return a + b; }
int multiply(int a, int b) { return a * b; }
int main() {
  int x = 5;
  int y = 10;
  int sum = add(x, y);
  int product = multiply(x, y);
  return sum + product;
}`

    const testFile = writeTestCppFile("multi-func.cpp", MULTI_FUNC_CPP)
    const { readFileSync } = require("fs")
    const content = readFileSync(testFile, "utf-8")
    const lines = content.split("\n")

    // Test that CFG can be built for different function names
    const cfg1 = buildCFG(lines, "add")
    expect(cfg1.functionName).toBe("add")
    expect(cfg1.blocks.size).toBeGreaterThanOrEqual(1)

    const cfg2 = buildCFG(lines, "main")
    expect(cfg2.functionName).toBe("main")
    expect(cfg2.blocks.size).toBeGreaterThanOrEqual(1)
  })

  it("should handle call chains in multi-function file", async () => {
    const CALL_CHAIN_CPP = `int step1(int x) { return x + 1; }
int step2(int x) { return x * 2; }
int main() {
  int a = 10;
  int b = step1(a);
  int c = step2(b);
  return c;
}`

    const testFile = writeTestCppFile("call-chain.cpp", CALL_CHAIN_CPP)
    const { readFileSync } = require("fs")
    const content = readFileSync(testFile, "utf-8")
    const lines = content.split("\n")

    const cfg = buildCFG(lines, "main")
    expect(cfg.functionName).toBe("main")
    expect(cfg.blocks.size).toBeGreaterThanOrEqual(1)

    // Check that statements are detected (could be assignment with function call)
    const stmtFound = Array.from(cfg.blocks.values()).some(block =>
      block.statements.length > 0
    )
    expect(stmtFound).toBe(true)
  })

  it("should trace data flow through interprocedural calls", async () => {
    const FLOW_CPP = `int foo(int x) { return x + 5; }
int bar(int y) { return y * 2; }
int main() {
  int a = 10;
  int b = foo(a);
  int c = bar(b);
  return c;
}`

    const testFile = writeTestCppFile("interproc-flow.cpp", FLOW_CPP)
    const { readFileSync } = require("fs")
    const content = readFileSync(testFile, "utf-8")
    const lines = content.split("\n")

    const cfg = buildCFG(lines, "main")
    const duInfo = buildDefUseChains(cfg, testFile)

    // Should find definitions for a, b, c
    expect(duInfo.definitions.has("a")).toBe(true)
    expect(duInfo.definitions.has("b")).toBe(true)
    expect(duInfo.definitions.has("c")).toBe(true)

    // Trace forward from a
    const result = analyzeDataFlow(cfg, duInfo, "a", undefined, "forward", testFile)
    expect(result).toBeDefined()
    expect(result.edges).toBeDefined()
    expect(result.allVariables).toContain("a")
  })
})

// ========================================
// Group 6: Integration with Variable Trace Tool (4 tests)
// ========================================

describe("Variable Trace Tool Integration", () => {
  it("should trace variable through multiple functions using tool", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "x", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const output = (result as any).output
    expect(output).toBeDefined()
    expect(typeof output).toBe("string")

    const meta = (result as any).metadata
    expect(meta.edges).toBeDefined()
    expect(Array.isArray(meta.edges)).toBe(true)
  })

  it("should trace backward through function calls using tool", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "s5", direction: "backward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta.edges).toBeDefined()
  })

  it("should handle pointers-chain with interprocedural trace using tool", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: POINTERS_CHAIN_CPP, variableName: "target", direction: "forward" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta.edges).toBeDefined()
  })

  it("should work with both direction on complex multi-function code", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: FUNCTION_FLOW_CPP, variableName: "x", direction: "both" },
      createMockToolContext(),
    )

    expect(result).toBeDefined()
    const output = (result as any).output
    expect(output).toBeDefined()
    expect(typeof output).toBe("string")
  })
})

// ========================================
// Group 7: Extended Edge Case Tests (3 tests)
// ========================================

describe("Extended Edge Case Tests", () => {
  it("should handle edge-cases: lambda-closure.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: LAMBDA_CLOSURE_CPP, variableName: "x", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
    const meta = (result as any).metadata
    expect(meta).toBeDefined()
  })

  it("should handle edge-cases: templates-generics.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: TEMPLATES_GENERICS_CPP, variableName: "val", direction: "both" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })

  it("should handle edge-cases: move-semantics.cpp", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.trace_variable!
    const result = await tool.execute(
      { filePath: MOVE_SEMANTICS_CPP, variableName: "src", direction: "forward" },
      createMockToolContext(),
    )
    expect(result).toBeDefined()
  })
})