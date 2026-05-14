import { describe, it, expect } from "bun:test"
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

describe("StaticAnalysisPlugin", () => {
  it("should return Hooks with all tools defined", async () => {
    const hooks = await StaticAnalysisPlugin(createMockContext())
    expect(hooks).toBeDefined()
    expect(hooks.tool).toBeDefined()
    expect(hooks.tool?.analyze_file).toBeDefined()
    expect(hooks.tool?.list_source_files).toBeDefined()
    expect(hooks.tool?.grep_source).toBeDefined()
    expect(hooks.tool?.code_stats).toBeDefined()
    expect(hooks.tool?.analyze_imports).toBeDefined()
    expect(hooks.tool?.find_unused_exports).toBeDefined()
    expect(hooks.tool?.analyze_complexity).toBeDefined()
  })

  describe("analyze_file", () => {
    it("should analyze a file successfully", async () => {
      const testFilePath = import.meta.path
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const analyzeTool = hooks.tool?.analyze_file!

      const result = await analyzeTool.execute({ filePath: testFilePath }, createMockToolContext())

      expect(result).toBeDefined()
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0)
      } else {
        expect(result.output).toContain("Total lines:")
        expect(result.metadata?.lineCount).toBeGreaterThan(0)
        expect(result.metadata?.language).toBeDefined()
      }
    })

    it("should handle non-existent file gracefully", async () => {
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const result = await hooks.tool?.analyze_file!.execute(
        { filePath: "/nonexistent/path/file.txt" },
        createMockToolContext(),
      )
      if (typeof result !== "string") {
        expect(result?.output).toContain("Error")
      }
    })
  })

  describe("list_source_files", () => {
    it("should list files in a directory", async () => {
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.list_source_files!
      const srcDir = import.meta.dir

      const result = await tool.execute({ directory: srcDir }, createMockToolContext())

      if (typeof result !== "string") {
        expect(result.output).toContain("Directory:")
        expect(result.metadata?.totalEntries).toBeGreaterThan(0)
      }
    })

    it("should handle invalid directory gracefully", async () => {
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const result = await hooks.tool?.list_source_files!.execute(
        { directory: "/not/a/real/dir" },
        createMockToolContext(),
      )
      if (typeof result !== "string") {
        expect(result?.output).toContain("Error")
      }
    })
  })

  describe("grep_source", () => {
    it("should find patterns in source files", async () => {
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.grep_source!

      const result = await tool.execute(
        { pattern: "analyze_file", directory: import.meta.dir },
        createMockToolContext(),
      )

      if (typeof result !== "string") {
        expect(result.metadata?.matchCount).toBeGreaterThan(0)
        expect(result.output).toContain("Search results")
      }
    })

    it("should return empty for non-existent patterns", async () => {
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const uniquePattern = `NONEXISTENT_PATTERN_${Date.now()}_${Math.random()}`
      const result = await hooks.tool?.grep_source!.execute(
        { pattern: uniquePattern, directory: import.meta.dir },
        createMockToolContext(),
      )
      if (typeof result !== "string") {
        expect(result?.output).toContain("No matches")
        expect(result?.metadata?.matchCount).toBe(0)
      }
    })
  })

  describe("code_stats", () => {
    it("should return code statistics", async () => {
      const hooks = await StaticAnalysisPlugin(createMockContext())
      const tool = hooks.tool?.code_stats!
      const projectDir = import.meta.dir!.replace(/src\\__tests__$/, "").replace(/src\/__tests__$/, "")

      const result = await tool.execute({ directory: projectDir }, createMockToolContext())

      if (typeof result !== "string") {
        expect(result.output).toContain("Code Statistics")
        expect(result.metadata?.totalFiles).toBeGreaterThan(0)
        expect(result.metadata?.byLanguage).toBeDefined()
        expect(Object.keys(result.metadata?.byLanguage ?? {}).length).toBeGreaterThan(0)
      }
    })
  })
})
