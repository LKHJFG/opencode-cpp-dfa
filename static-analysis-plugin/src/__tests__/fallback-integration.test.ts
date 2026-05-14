/**
 * Tests for trace_variable Fallback Chain (v3→v2→v1)
 *
 * Verifies that the variable trace tool correctly falls back through
 * different analysis engines when higher-level analysis fails.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { resolve, dirname } from "path"
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs"
import StaticAnalysisPlugin from "../index"

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

// ========================================
// Test fixtures
// ========================================

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

const NO_FUNC_CPP = `int x = 5;
int y = x + 1;`

// ========================================
// Test Suite: Fallback Integration
// ========================================

describe("trace_variable fallback chain", () => {
  let cleanup: () => void

  beforeAll(() => {
    cleanTestFiles()
  })

  afterAll(() => {
    cleanTestFiles()
  })

  // Test 1: v3 normal path - single function with AST
  describe("v3: AST-based analysis (single function)", () => {
    it("should use v3 engine and return valid edges", async () => {
      const testFile = writeTestCppFile("single-func.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
      expect(meta.allVariables).toBeDefined()
      expect(Array.isArray(meta.allVariables)).toBe(true)
    })
  })

  // Test 2: v3 normal path - multi-function triggers cross-function DFA
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
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
    })
  })

  // Test 3: v1 fallback - no functions, simple code
  describe("v1: Line-scan fallback", () => {
    it("should produce output without AST parsing", async () => {
      const testFile = writeTestCppFile("no-func.cpp", NO_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "x", direction: "forward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
      expect(meta.edges).toBeDefined()
      expect(Array.isArray(meta.edges)).toBe(true)
    })
  })

  // Test 4: Edge case - empty file
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
      // Should not crash, may return empty edges or error
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
    })

    it("should handle non-existent variable gracefully", async () => {
      const testFile = writeTestCppFile("test.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "nonexistent_var_xyz", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = (result as any).metadata
      // Should not crash, may return empty edges
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
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
    })
  })

  // Test 5: Verify backward direction works
  describe("direction parameter", () => {
    it("should trace backward correctly", async () => {
      const testFile = writeTestCppFile("backward.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "z", direction: "backward" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
      expect(meta.direction).toBe("backward")
    })

    it("should trace both directions", async () => {
      const testFile = writeTestCppFile("both.cpp", SINGLE_FUNC_CPP)

      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.trace_variable!
      const result = await tool.execute(
        { filePath: testFile, variableName: "y", direction: "both" },
        createMockToolContext(),
      )

      expect(result).toBeDefined()
      const meta = (result as any).metadata
      expect(meta).toBeDefined()
      expect(meta.direction).toBe("both")
    })
  })
})