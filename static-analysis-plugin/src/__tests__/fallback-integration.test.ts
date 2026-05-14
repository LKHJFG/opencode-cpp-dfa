import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { resolve } from "path"
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from "fs"
import StaticAnalysisPlugin from "../index"

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
      const files = readdirSync(testDir)
      for (const f of files) {
        unlinkSync(resolve(testDir, f))
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

const SINGLE_FUNC_CPP = `int main() {
  int x = 10;
  int y = x + 5;
  int z = y * 2;
  return z;
}`

const MULTI_FUNC_CPP = `int compute(int a) {
  return a * 2;
}

int main() {
  int x = 10;
  int y = compute(x);
  return y;
}`

const COMPLEX_MULTI_FUNC_CPP = `int compute(int a) {
  return a * 2;
}

int process(int b) {
  int c = compute(b);
  return c + 1;
}

int main() {
  int x = 10;
  int y = process(x);
  return y;
}`

const SYNTAX_ERROR_CPP = `int main() {
  int x = 10
  int y = x + 5;
  return y;
}`

const GLOBAL_SCOPE_CPP = `int x = 5;
int y = x + 1;`

const FORWARD_TRACE_CPP = `int main() {
  int a = 1;
  int b = a + 1;
  int c = b * 2;
  int d = c - 1;
  return d;
}`

const BACKWARD_TRACE_CPP = `int main() {
  int a = 1;
  int b = a + 1;
  int c = b + a;
  int d = c * 2;
  return d;
}`

const PREPROCESSOR_CPP = `#include <iostream>
#define VALUE 42
#define DOUBLE(x) ((x) * 2)

int main() {
  int x = VALUE;
  int y = DOUBLE(x);
  return y;
}`

const MALFORMED_CPP = `int main() {
  int x = 10;
  int y = x + 5;
`

function generateLargeFunction(): string {
  let code = `int main() {\n`
  code += `  int sum = 0;\n`
  for (let i = 0; i < 200; i++) {
    code += `  int var${i} = ${i};\n`
    code += `  sum += var${i};\n`
  }
  code += `  return sum;\n}`
  return code
}

describe("trace_variable fallback chain", () => {
  beforeAll(() => {
    cleanTestFiles()
  })

  afterAll(() => {
    cleanTestFiles()
  })

  // ==============================================
  // v3: AST-based normal paths
  // ==============================================
  describe("v3: AST-based analysis (single function)", () => {
    it("should use v3 engine and trace forward x→y→z", async () => {
      const testFile = writeTestCppFile("v3-forward.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.edges.length).toBeGreaterThan(0)
      expect(meta.allVariables).toBeDefined()
      expect(Array.isArray(meta.allVariables)).toBe(true)
      expect(meta.allVariables).toContain("x")
      expect(meta.allVariables).toContain("y")
    })

    it("should trace backward from z to x", async () => {
      const testFile = writeTestCppFile("v3-backward.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "z", direction: "backward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.edges.length).toBeGreaterThan(0)
      expect(meta.direction).toBe("backward")
      expect(meta.allVariables).toContain("z")
    })

    it("should trace both directions from middle variable y", async () => {
      const testFile = writeTestCppFile("v3-both.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "y", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.direction).toBe("both")
      expect(meta.edges.length).toBeGreaterThanOrEqual(1)
      expect(meta.allVariables).toContain("x")
      expect(meta.allVariables).toContain("y")
      expect(meta.allVariables).toContain("z")
    })
  })

  describe("v3: Cross-function DFA", () => {
    it("should use v3 engine for multi-function code", async () => {
      const testFile = writeTestCppFile("multi-func.cpp", MULTI_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.edges.length).toBeGreaterThan(0)
    })

    it("should trace backward through function boundary", async () => {
      const testFile = writeTestCppFile("multi-func-backward.cpp", MULTI_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "y", direction: "backward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(meta.direction).toBe("backward")
    })

    it("should trace through 3-function chain", async () => {
      const testFile = writeTestCppFile("complex-multi.cpp", COMPLEX_MULTI_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.allVariables).toContain("x")
    })
  })

  // ==============================================
  // Fallback chain: v3→v2→v1
  // ==============================================
  describe("fallback chain: degradation scenarios", () => {
    it("should gracefully degrade to v1 for syntax error", async () => {
      const testFile = writeTestCppFile("syntax-error.cpp", SYNTAX_ERROR_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.allVariables).toBeDefined()
      expect(Array.isArray(meta.allVariables)).toBe(true)
    })

    it("should handle global-scope code with no functions", async () => {
      const testFile = writeTestCppFile("global-scope.cpp", GLOBAL_SCOPE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.allVariables).toContain("x")
    })

    it("should handle malformed C++ with unclosed block", async () => {
      const testFile = writeTestCppFile("malformed.cpp", MALFORMED_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
    })

    it("should handle preprocessor-heavy input", async () => {
      const testFile = writeTestCppFile("preprocessor.cpp", PREPROCESSOR_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
    })
  })

  // ==============================================
  // v1: Line-scan fallback verification
  // ==============================================
  describe("v1: line-scan fallback", () => {
    it("should produce output without AST parsing for forward trace", async () => {
      const testFile = writeTestCppFile("v1-forward.cpp", GLOBAL_SCOPE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.allVariables).toBeDefined()
    })

    it("should handle backward trace with global scope", async () => {
      const testFile = writeTestCppFile("v1-backward.cpp", GLOBAL_SCOPE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "y", direction: "backward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(meta.direction).toBe("backward")
    })

    it("should handle both directions with global scope", async () => {
      const testFile = writeTestCppFile("v1-both.cpp", GLOBAL_SCOPE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(meta.direction).toBe("both")
    })
  })

  // ==============================================
  // Edge cases
  // ==============================================
  describe("edge cases", () => {
    it("should handle empty file gracefully", async () => {
      const testFile = writeTestCppFile("empty.cpp", "")

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
    })

    it("should handle non-existent variable gracefully", async () => {
      const testFile = writeTestCppFile("nonexistent.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "nonexistent_var_xyz", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
    })

    it("should handle file with only comments", async () => {
      const testFile = writeTestCppFile("comments.cpp", `// This is a comment
// Another comment
/* Multi-line
   comment */`)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
    })

    it("should not time out on very large function (>200 lines)", async () => {
      const largeCode = generateLargeFunction()
      const testFile = writeTestCppFile("large-func.cpp", largeCode)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!

      const startTime = Date.now()
      const result = await tool.execute(
        { filePath: testFile, variableName: "sum", direction: "forward" },
        createMockToolContext(),
      )
      const elapsed = Date.now() - startTime

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(elapsed).toBeLessThan(30000)
    })

    it("should handle large function backward trace", async () => {
      const largeCode = generateLargeFunction()
      const testFile = writeTestCppFile("large-func-backward.cpp", largeCode)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "sum", direction: "backward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.direction).toBe("backward")
    })
  })

  // ==============================================
  // Direction parameter verification
  // ==============================================
  describe("direction parameter", () => {
    it("should trace forward correctly through multi-step chain", async () => {
      const testFile = writeTestCppFile("forward-chain.cpp", FORWARD_TRACE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "a", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(meta.direction).toBe("forward")
      expect(meta.allVariables).toContain("a")
      expect(meta.allVariables).toContain("b")
      expect(meta.allVariables).toContain("c")
      expect(meta.allVariables).toContain("d")
    })

    it("should trace backward correctly with multiple sources", async () => {
      const testFile = writeTestCppFile("backward-chain.cpp", BACKWARD_TRACE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "d", direction: "backward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(meta.direction).toBe("backward")
      expect(meta.allVariables).toContain("d")
    })

    it("should trace both directions from middle variable", async () => {
      const testFile = writeTestCppFile("both-middle.cpp", FORWARD_TRACE_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "b", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = result.metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(meta.direction).toBe("both")
      expect(meta.allVariables).toContain("a")
      expect(meta.allVariables).toContain("b")
      expect(meta.allVariables).toContain("c")
    })
  })
})
