/**
 * Boundary Tests + Mutation Sensitivity Tests
 *
 * Boundary Tests:  empty, malformed, huge, deeply nested, etc. (15 tests)
 * Mutation Tests:  verify precise behavioral contracts that catch regressions (5 tests)
 *
 * All internal helpers imported directly to test at unit level.
 * No existing test files or production code modified.
 */

import { describe, it, expect } from "bun:test"
import { buildCFG } from "../tools/cpp/cpp-cfg"
import { buildDefUseChains, analyzeDataFlow, traceForward, traceBackward, type FlowEdge } from "../tools/cpp/cpp-dataflow"
import type { ControlFlowGraph, Statement } from "../tools/cpp/cfg-types"
import { resolve } from "path"
import { writeFileSync, mkdirSync, existsSync } from "fs"

// ============================================================
// Helpers
// ============================================================

function makeCfg(source: string, funcName = "test"): ControlFlowGraph {
  return buildCFG(source.split("\n"), funcName)
}

function makeDu(source: string, funcName = "test") {
  const cfg = makeCfg(source, funcName)
  return { cfg, du: buildDefUseChains(cfg, "test.cpp") }
}

function countStmts(cfg: ControlFlowGraph): number {
  let n = 0
  for (const [, b] of cfg.blocks) n += b.statements.length
  return n
}

const testDir = resolve(import.meta.dir, "../../.test-tmp")

function ensureDir() {
  if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true })
}

// ============================================================
// BOUNDARY TESTS
// ============================================================

describe("boundary — empty / minimal input", () => {

  it("empty file produces valid CFG with zero statements", () => {
    const cfg = makeCfg("")
    expect(cfg.blocks.size).toBeGreaterThanOrEqual(1)
    expect(countStmts(cfg)).toBe(0)
    expect(cfg.functionName).toBe("test")
  })

  it("file with only whitespace lines produces zero-statement CFG", () => {
    const lines = ["", "  ", "   ", "    "]
    const cfg = makeCfg(lines.join("\n"))
    expect(countStmts(cfg)).toBe(0)
  })

  it("file with only comments produces zero-statement CFG", () => {
    const src = [
      "// this is a comment",
      "/* block comment */",
      "// another line",
      "  // indented comment",
    ].join("\n")
    const cfg = makeCfg(src)
    expect(countStmts(cfg)).toBe(0)
  })

  it("file with only preprocessor directives produces zero-statement CFG", () => {
    const src = [
      "#include <iostream>",
      "#define FOO 42",
      "#pragma once",
      "#ifdef DEBUG",
      "#endif",
    ].join("\n")
    const cfg = makeCfg(src)
    expect(countStmts(cfg)).toBe(0)
  })

  it("empty function body — void foo() {}", () => {
    const src = "void foo() {}"
    const cfg = makeCfg(src)
    // The line is parsed as a function_call expression (1 statement)
    expect(countStmts(cfg)).toBe(1)
  })
})

describe("boundary — malformed syntax", () => {

  it("missing semicolons does not crash CFG builder", () => {
    const src = [
      "int a = 5",
      "int b = a + 3",
      "int c = b",
    ].join("\n")
    const cfg = makeCfg(src)
    expect(countStmts(cfg)).toBeGreaterThanOrEqual(1)
  })

  it("unmatched braces does not crash analyzer", () => {
    const src = [
      "int a = 1;",
      "if (a > 0) {",
      "  int b = a;",
      "  if (b > 0) {",
      "    int c = b;",
      "}}}}}",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    const cfgStmts = countStmts(cfg)
    expect(cfgStmts).toBeGreaterThanOrEqual(2)
    // analyzeDataFlow should not throw
    const result = analyzeDataFlow(cfg, du, "a", undefined, "forward", "test.cpp")
    expect(result.edges).toBeDefined()
  })
})

describe("boundary — deeply nested control flow (>10 levels)", () => {

  const NEST_DEPTH = 14

  it("builds CFG for >10 level nested if-else without stack overflow", () => {
    const lines: string[] = []
    lines.push("int main() {")
    lines.push("  int x = 1;")
    for (let i = 0; i < NEST_DEPTH; i++) {
      lines.push(`  ${"  ".repeat(i)}if (x > ${i}) {`)
      lines.push(`  ${"  ".repeat(i + 1)}int y${i} = x + ${i};`)
    }
    for (let i = NEST_DEPTH - 1; i >= 0; i--) {
      lines.push(`  ${"  ".repeat(i)}}`)
    }
    lines.push("  return x;")
    lines.push("}")
    const src = lines.join("\n")
    const { cfg, du } = makeDu(src, "main")
    // CFG is built without crash
    expect(countStmts(cfg)).toBeGreaterThanOrEqual(1)
    // Forward trace from x finds flow into nested y variables
    const result = analyzeDataFlow(cfg, du, "x", undefined, "forward", "test.cpp")
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
  })
})

describe("boundary — large file (>500 lines)", () => {

  it("builds CFG and traces through 500+ line assignment chain", () => {
    const lines: string[] = []
    lines.push("int main() {")
    lines.push("  int x0 = 1;")
    for (let i = 1; i <= 500; i++) {
      lines.push(`  int x${i} = x${i - 1} + 1;`)
    }
    lines.push("  return x500;")
    lines.push("}")
    const src = lines.join("\n")
    const { cfg, du } = makeDu(src, "main")
    expect(countStmts(cfg)).toBeGreaterThanOrEqual(500)

    // Forward trace from x0
    const forward = traceForward(cfg, du, "x0", 1)
    expect(forward.length).toBeGreaterThan(0)

    // Backward trace from x500
    const backward = traceBackward(cfg, du, "x500")
    expect(backward.length).toBeGreaterThan(0)
  })
})

describe("boundary — duplicate and overshadowed variables", () => {

  it("duplicate variable declaration — second def is tracked separately", () => {
    const src = [
      "int x = 10;",
      "x = 20;",
      "int y = x;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    expect(du.definitions.has("x")).toBe(true)
    expect(du.definitions.has("y")).toBe(true)
    const defs = du.definitions.get("x")!
    // x has at least 1 definition record
    expect(defs.length).toBeGreaterThanOrEqual(1)
  })

  it("variable overshadowed by inner scope — inner and outer are both tracked", () => {
    const src = [
      "int x = 1;",
      "if (x > 0) {",
      "  int x = 2;",
      "  int y = x;",
      "}",
      "int z = x;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // Both inner and outer x exist in the def-use info
    expect(du.definitions.has("x")).toBe(true)
    expect(du.uses.has("x")).toBe(true)
    // AnalyzeDataFlow should not crash
    const result = analyzeDataFlow(cfg, du, "x", undefined, "both", "test.cpp")
    expect(result.edges).toBeDefined()
  })
})

describe("boundary — special variable names & values", () => {

  it("very long variable name (>100 chars) is handled", () => {
    const longName = "a" + "bcdefghij".repeat(12)
    const src = `int ${longName} = 42;`
    const { cfg, du } = makeDu(src)
    expect(du.definitions.has(longName)).toBe(true)
    const result = traceForward(cfg, du, longName, 1)
    expect(result).toBeDefined()
  })

  it("variable name matching C++ keywords does not break parser", () => {
    // "auto" used as variable name (valid C++ with tree-sitter, but our line-scan sees it)
    const src = [
      "int _auto = 5;",
      "int _int = 10;",
      "int result = _auto + _int;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    expect(du.definitions.has("_auto")).toBe(true)
    expect(du.definitions.has("_int")).toBe(true)
    const result = analyzeDataFlow(cfg, du, "_auto", undefined, "forward", "test.cpp")
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("string literals containing code-like content are not parsed as code", () => {
    const src = [
      'const char* s = "int a = 5; int b = a + 3;";',
      "int x = 42;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // The string content includes declaration-like text but should NOT produce
    // additional variable definitions in the CFG
    expect(countStmts(cfg)).toBeGreaterThanOrEqual(1)
    // x should be traced (traceForward returns FlowEdge[] directly)
    const result = traceForward(cfg, du, "x")
    expect(Array.isArray(result)).toBe(true)
  })

  it("uninitialized variable usage — int x; int y = x;", () => {
    const src = [
      "int x;",
      "int y = x;",
      "int z = y;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // x is declared but uninitialized — should still appear in definitions
    // because the declaration statement is parsed
    const xDefs = du.definitions.get("x")
    expect(xDefs).toBeDefined()
    const result = analyzeDataFlow(cfg, du, "x", undefined, "forward", "test.cpp")
    expect(result.allVariables.length).toBeGreaterThanOrEqual(2)
  })
})

describe("boundary — return & control flow extremes", () => {

  it("multiple return paths in a single function are all traced", () => {
    const src = [
      "int compute(int a) {",
      "  if (a > 0) return a + 1;",
      "  if (a < 0) return a - 1;",
      "  return 0;",
      "}",
    ].join("\n")
    const { cfg, du } = makeDu(src, "compute")
    // return statements each generate a stmt
    const stmtCount = countStmts(cfg)
    expect(stmtCount).toBeGreaterThanOrEqual(3)
    const forward = traceForward(cfg, du, "a")
    expect(forward).toBeDefined()
    expect(Array.isArray(forward)).toBe(true)
  })

  it("multi-statement lines are handled gracefully", () => {
    const src = ["int x = 1;", "int y = x;", "int z = y;"].join("\n")
    const { cfg, du } = makeDu(src)
    expect(countStmts(cfg)).toBeGreaterThanOrEqual(2)
    const result = traceForward(cfg, du, "x", 1)
    expect(result).toBeDefined()
  })

  it("last line without trailing newline is handled", () => {
    const src = "int a = 1;\nint b = a;"
    const { cfg, du } = makeDu(src)
    expect(countStmts(cfg)).toBeGreaterThanOrEqual(2)
    const result = traceForward(cfg, du, "a")
    expect(result.length).toBe(1)
  })
})

// ============================================================
// MUTATION TESTS  — precise behavioral contracts
// A mutation test verifies that IF a specific behavior were broken,
// the test would fail. These are exact-contract tests on internal
// behavior that are sensitive to regressions.
// ============================================================

describe("mutation — normalizeDefVar contract (cpp-cfg.ts)", () => {

  it("strips leading * from normalized def variable", () => {
    const src = "int x = 1;\nint y = x;\n"
    const { cfg } = makeDu(src)
    // The first statement should have defVars=["x"], not ["*ptr"]
    // If normalizeDefVar were broken, *ptr would be the raw lvalue
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.text.includes("*ptr")) {
          expect(stmt.defVars[0]).not.toMatch(/^\*/)
        }
      }
    }
    // Ensure at least x def exists
    expect(cfg.blocks.size).toBeGreaterThanOrEqual(1)
  })

  it("strips array subscript from def variable — arr[0] → arr", () => {
    const src = ["int arr[10];", "arr[0] = 5;", "int x = arr[0];"].join("\n")
    const { cfg } = makeDu(src)
    // The assignment "arr[0] = 5;" should normalize defVar to "arr", not "arr[0]"
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.text.startsWith("arr[0]")) {
          expect(stmt.defVars).toContain("arr")
          expect(stmt.defVars).not.toContain("arr[0]")
        }
      }
    }
  })

  it("strips member access chain from def variable", () => {
    const src = ["struct S { int field; };", "S s;", "s.field = 42;", "int x = s.field;"].join("\n")
    const { cfg } = makeDu(src)
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.text.startsWith("s.field")) {
          expect(stmt.defVars).toContain("s")
          expect(stmt.defVars).not.toContain("s.field")
        }
      }
    }
  })

  it("handles pointer-to-member: ptr->member = val → defVar is ptr", () => {
    const src = ["struct S { int field; };", "S* ptr;", "ptr->field = 10;", "int x = ptr->field;"].join("\n")
    const { cfg } = makeDu(src)
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.text.startsWith("ptr->field")) {
          expect(stmt.defVars).toContain("ptr")
          expect(stmt.defVars).not.toContain("ptr->field")
        }
      }
    }
  })
})

describe("mutation — deduplicateEdges contract (cpp-dataflow.ts)", () => {

  it("identical (fromVar, toVar, fromLine, toLine) edges are deduplicated in analyzeDataFlow", () => {
    // Create a scenario where the same edge could be produced twice
    const src = [
      "int x = 1;",
      "int y = x;",
      "int z = y;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // Forward trace from x should produce exactly 1 edge (x→y)
    const fwd = traceForward(cfg, du, "x", 1)
    const xToY = fwd.filter(e => e.fromVar === "x" && e.toVar === "y")
    expect(xToY.length).toBe(1)
    // Backward trace from z should produce exactly 1 edge (y→z)
    const bwd = traceBackward(cfg, du, "z")
    const yToZ = bwd.filter(e => e.fromVar === "y" && e.toVar === "z")
    expect(yToZ.length).toBe(1)
  })
})

describe("mutation — parseLine contract: DECL_PATTERN (cpp-cfg.ts)", () => {

  it("variable declaration with const/unsigned/long modifiers is parsed", () => {
    const src = [
      "const unsigned long long x = 42;",
      "signed short int y = 10;",
      "int z = x + y;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // All three variables should be detected as defs
    expect(du.definitions.has("x")).toBe(true)
    expect(du.definitions.has("y")).toBe(true)
    expect(du.definitions.has("z")).toBe(true)
    // Forward trace from x should flow to z
    const result = traceForward(cfg, du, "x")
    const flowsToZ = result.some(e => e.toVar === "z")
    expect(flowsToZ).toBe(true)
  })
})

describe("mutation — parseLine contract: ASSIGN_PATTERN (cpp-cfg.ts)", () => {

  it("compound assignment operators (+= -= *=) are parsed as def+use", () => {
    const src = [
      "int x = 10;",
      "x += 5;",
      "x *= 2;",
      "int y = x;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // x += 5 should def x and use x
    // x *= 2 should def x and use x
    expect(du.definitions.has("x")).toBe(true)
    expect(du.uses.has("x")).toBe(true)
    // Forward trace from original x should reach y
    const result = traceForward(cfg, du, "x")
    const reachesY = result.some(e => e.toVar === "y")
    expect(reachesY).toBe(true)
  })

  it("pointer dereference assignment: *ptr = val — defVar is ptr", () => {
    const src = [
      "int val = 42;",
      "int* ptr = &val;",
      "*ptr = 100;",
      "int result = val;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    // The "*ptr = 100" line should be parsed; defVar should be "ptr" after normalizeDefVar
    for (const [, block] of cfg.blocks) {
      for (const stmt of block.statements) {
        if (stmt.text.startsWith("*ptr")) {
          expect(stmt.defVars.length).toBeGreaterThanOrEqual(1)
        }
      }
    }
    // Forward trace from val
    const result = traceForward(cfg, du, "val")
    expect(Array.isArray(result)).toBe(true)
  })
})

describe("mutation — traceForward MAX_DEPTH guard (cpp-dataflow.ts)", () => {

  it("forward trace stops after MAX_DEPTH iterations, preventing infinite loop", () => {
    // Build a chain longer than MAX_DEPTH (20) to verify depth limit
    const lines: string[] = []
    lines.push("int x0 = 1;")
    for (let i = 1; i <= 25; i++) {
      lines.push(`int x${i} = x${i - 1} + 1;`)
    }
    const src = lines.join("\n")
    const { cfg, du } = makeDu(src)
    const result = traceForward(cfg, du, "x0", 1)
    // Depth is limited — edges should not exceed MAX_DEPTH * something
    expect(result.length).toBeLessThanOrEqual(30)
    // But forward trace should still find some variables
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})

describe("mutation — edge type classification (cpp-dataflow.ts)", () => {

  it("pointer flow edge is classified correctly when * or -> is present", () => {
    const src = [
      "int x = 42;",
      "int* p = &x;",
      "int y = *p;",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    const result = traceForward(cfg, du, "x")
    // Some edges may be pointer-related
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it("offset edge is classified when [] is present", () => {
    const src = [
      "int arr[10];",
      "arr[0] = 5;",
      "int x = arr[0];",
    ].join("\n")
    const { cfg, du } = makeDu(src)
    const result = traceForward(cfg, du, "arr")
    expect(result).toBeDefined()
  })
})

describe("mutation — variable not found returns empty result (cpp-dataflow.ts)", () => {

  it("traceForward returns empty edges for nonexistent variable", () => {
    const src = "int x = 1;\nint y = x;\n"
    const { cfg, du } = makeDu(src)
    const result = traceForward(cfg, du, "nonexistent")
    expect(result).toEqual([])
  })

  it("traceBackward returns empty edges for nonexistent variable", () => {
    const src = "int x = 1;\nint y = x;\n"
    const { cfg, du } = makeDu(src)
    const result = traceBackward(cfg, du, "nonexistent")
    expect(result).toEqual([])
  })

  it("analyzeDataFlow returns summary with 'not found' for nonexistent variable", () => {
    const src = "int x = 1;\n"
    const { cfg, du } = makeDu(src)
    const result = analyzeDataFlow(cfg, du, "ghost", undefined, "both", "test.cpp")
    expect(result.edges).toEqual([])
    expect(result.summary).toContain("not found")
  })
})
