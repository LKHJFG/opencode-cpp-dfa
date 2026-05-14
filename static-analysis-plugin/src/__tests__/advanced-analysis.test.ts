import { describe, it, expect } from "bun:test"
import { resolve, dirname } from "path"
import StaticAnalysisPlugin from "../index"
import { analyzeImports } from "../tools/import-analysis"
import { findUnusedExports } from "../tools/unused-exports"
import { analyzeComplexity } from "../tools/complexity"

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

const projectRoot = resolve(import.meta.dir, "../..")

// ========================================
// Unit tests for analyzeImports
// ========================================
describe("analyzeImports", () => {
  it("should detect basic imports", () => {
    const code = [
      'import { foo, bar } from "./utils"',
      'import baz from "lodash"',
      'import * as React from "react"',
    ].join("\n")
    const result = analyzeImports(code, "/project/src/index.ts", "/project")
    expect(result.imports.length).toBeGreaterThanOrEqual(3)
    expect(result.externalDependencies).toContain("lodash")
    expect(result.externalDependencies).toContain("react")
    expect(result.internalDependencies).toContain("./utils")
  })

  it("should detect type-only imports", () => {
    const code = [
      'import type { Config } from "./types"',
      'import type { User } from "some-lib"',
    ].join("\n")
    const result = analyzeImports(code, "/project/src/index.ts", "/project")
    const typeImports = result.imports.filter(i => i.isTypeOnly)
    expect(typeImports.length).toBe(2)
  })

  it("should detect export function", () => {
    const code = "export function hello() {}"
    const result = analyzeImports(code, "/project/src/index.ts", "/project")
    expect(result.exports.length).toBe(1)
    expect(result.exports[0]!.name).toBe("hello")
  })

  it("should detect export const", () => {
    const code = 'export const name = "world"'
    const result = analyzeImports(code, "/project/src/index.ts", "/project")
    expect(result.exports.length).toBe(1)
    expect(result.exports[0]!.name).toBe("name")
  })

  it("should detect export default class", () => {
    const code = "export default class MyClass {}"
    const result = analyzeImports(code, "/project/src/index.ts", "/project")
    expect(result.exports.length).toBe(1)
    expect(result.exports[0]!.name).toBe("MyClass")
  })

  it("should detect all exports when joined by newline", () => {
    const code = [
      "export function hello() {}",
      'export const name = "world"',
      "export default class MyClass {}",
    ].join("\n")
    const result = analyzeImports(code, "/project/src/index.ts", "/project")
    expect(result.exports.length).toBe(3)
  })

  it("should handle empty files gracefully", () => {
    const result = analyzeImports("", "/project/src/empty.ts", "/project")
    expect(result.imports).toEqual([])
    expect(result.exports).toEqual([])
    expect(result.externalDependencies).toEqual([])
    expect(result.internalDependencies).toEqual([])
    expect(result.summary).toBeTruthy()
  })
})

// ========================================
// Unit tests for analyzeComplexity
// ========================================
describe("analyzeComplexity", () => {
  it("should detect functions and measure complexity", () => {
    const code = `
function simple() {
  return 42
}

function complex(x: number) {
  if (x > 0) {
    if (x > 10) {
      return "big"
    }
    return "small"
  }
  for (let i = 0; i < x; i++) {
    if (i % 2 === 0) {
      console.log(i)
    }
  }
  return "done"
}
`
    const result = analyzeComplexity(code, "/project/src/test.ts")
    expect(result.functions.length).toBe(2)
    const simple = result.functions.find(f => f.name === "simple")
    const complex = result.functions.find(f => f.name === "complex")
    expect(simple).toBeDefined()
    expect(simple!.cyclomaticComplexity).toBe(1)
    expect(complex).toBeDefined()
    expect(complex!.cyclomaticComplexity).toBeGreaterThan(1)
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.overallScore).toBeLessThanOrEqual(100)
  })

  it("should handle arrow functions", () => {
    const code = `const add = (a: number, b: number) => a + b`
    const result = analyzeComplexity(code, "/project/src/test.ts")
    expect(result.functions.length).toBeGreaterThanOrEqual(1)
  })

  it("should handle empty file", () => {
    const result = analyzeComplexity("", "/project/src/empty.ts")
    expect(result.functions).toEqual([])
    expect(result.averageComplexity).toBe(0)
    expect(result.highestComplexity).toBeNull()
  })
})

// ========================================
// Unit tests for findUnusedExports
// ========================================
describe("findUnusedExports", () => {
  it("should return results for a real project directory", () => {
    const result = findUnusedExports(resolve(import.meta.dir, "../../src"), {
      excludeDirs: ["__tests__", "node_modules"],
      maxFiles: 50,
    })
    expect(result.totalFiles).toBeGreaterThan(0)
    expect(result.totalExports).toBeGreaterThanOrEqual(0)
    expect(typeof result.summary).toBe("string")
    expect(result.summary.length).toBeGreaterThan(0)
  })

  it("should handle non-existent directory gracefully", () => {
    const result = findUnusedExports("/nonexistent/path", { maxFiles: 10 })
    expect(result.totalFiles).toBe(0)
    expect(result.totalExports).toBe(0)
    expect(result.unused).toEqual([])
  })

  it("should handle empty directory", () => {
    const result = findUnusedExports(resolve(import.meta.dir, "__test_empty_dir__"), {
      maxFiles: 10,
    })
    expect(result.totalFiles).toBe(0)
    expect(result.totalExports).toBe(0)
  })
})

// ========================================
// Tool integration tests
// ========================================
describe("analyze_imports tool", () => {
  it("should be registered in plugin hooks", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    expect(hooks.tool?.analyze_imports).toBeDefined()
  })

  it("should analyze a TypeScript file", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.analyze_imports!
    const filePath = resolve(import.meta.dir, "../index.ts")

    const result = await tool.execute({ filePath }, createMockToolContext())

    if (typeof result !== "string") {
      expect(result.output).toBeTruthy()
      expect(result.metadata?.filePath).toBe(filePath)
      expect(typeof result.metadata?.importCount).toBe("number")
    }
  })

  it("should handle non-existent file gracefully", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const result = await hooks.tool?.analyze_imports!.execute(
      { filePath: "/nonexistent/file.ts" },
      createMockToolContext(),
    )
    if (typeof result !== "string") {
      expect(result?.output).toContain("Error")
    }
  })
})

describe("analyze_complexity tool", () => {
  it("should be registered in plugin hooks", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    expect(hooks.tool?.analyze_complexity).toBeDefined()
  })

  it("should analyze a TypeScript file", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.analyze_complexity!
    const filePath = resolve(import.meta.dir, "../tools/complexity.ts")

    const result = await tool.execute({ filePath }, createMockToolContext())

    if (typeof result !== "string") {
      expect(result.output).toBeTruthy()
      expect(result.metadata?.filePath).toBe(filePath)
      expect(typeof result.metadata?.functionCount).toBe("number")
      expect(typeof result.metadata?.overallScore).toBe("number")
    }
  })

  it("should handle non-existent file gracefully", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const result = await hooks.tool?.analyze_complexity!.execute(
      { filePath: "/nonexistent/file.ts" },
      createMockToolContext(),
    )
    if (typeof result !== "string") {
      expect(result?.output).toContain("Error")
    }
  })
})

describe("find_unused_exports tool", () => {
  it("should be registered in plugin hooks", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    expect(hooks.tool?.find_unused_exports).toBeDefined()
  })

  it("should scan a directory", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const tool = hooks.tool?.find_unused_exports!
    const srcDir = resolve(import.meta.dir, "..")

    const result = await tool.execute(
      { directory: srcDir, excludeDirs: "__tests__,node_modules" },
      createMockToolContext(),
    )

    if (typeof result !== "string") {
      expect(result.output).toBeTruthy()
      expect(typeof result.metadata?.totalExports).toBe("number")
      expect(typeof result.metadata?.totalFiles).toBe("number")
      expect(result.metadata?.directory).toBe(srcDir)
    }
  })

  it("should handle non-existent directory", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    const result = await hooks.tool?.find_unused_exports!.execute(
      { directory: "/nonexistent/path" },
      createMockToolContext(),
    )
    if (typeof result !== "string") {
      expect(result?.output).toBeTruthy()
    }
  })
})
