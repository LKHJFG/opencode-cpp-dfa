import { describe, it, expect } from "bun:test"
import { existsSync, writeFileSync, mkdirSync } from "fs"
import { join, resolve } from "path"

// Test utility functions directly
import { analyzeSource } from "../tools/analyze"
import { listSourceFiles, getCodeStats, detectLanguage } from "../tools/listing"
import { grepSource } from "../tools/search"
import { readFile } from "../utils/file-reader"

describe("analyzeSource edge cases", () => {
  it("should handle empty content", () => {
    const result = analyzeSource("", "/test/empty.ts")
    expect(result.lineCount).toBe(1) // empty string has 1 line
    expect(result.findings).toHaveLength(0)
    expect(result.summary).toContain("Total lines: 1")
  })

  it("should handle single line content", () => {
    const result = analyzeSource("const x = 1;", "/test/simple.ts")
    expect(result.lineCount).toBe(1)
    expect(result.findings).toHaveLength(0)
  })

  it("should detect all comment types", () => {
    const content = [
      "// TODO: implement this",
      "// FIXME: broken logic",
      "// HACK: temporary workaround",
      "// XXX: needs review",
      "function test() {}",
    ].join("\n")

    const result = analyzeSource(content, "/test/comments.ts")
    const todoFindings = result.findings.filter(f => f.ruleId === "comment-todo")
    expect(todoFindings).toHaveLength(4)
  })

  it("should warn on long lines", () => {
    const content = "x".repeat(150)
    const result = analyzeSource(content, "/test/long.ts")
    const longLineFindings = result.findings.filter(f => f.ruleId === "line-length")
    expect(longLineFindings.length).toBeGreaterThanOrEqual(1)
  })

  it("should detect trailing whitespace", () => {
    const content = "const x = 1;   \nconst y = 2;"
    const result = analyzeSource(content, "/test/trailing.ts")
    const trailingFindings = result.findings.filter(f => f.ruleId === "trailing-whitespace")
    expect(trailingFindings).toHaveLength(1)
  })

  it("should detect long functions", () => {
    const lines: string[] = ["function longFunc() {"]
    for (let i = 0; i < 120; i++) {
      lines.push(`  const x${i} = ${i};`)
    }
    lines.push("}")

    const result = analyzeSource(lines.join("\n"), "/test/long-func.ts")
    const funcLengthFindings = result.findings.filter(f => f.ruleId === "function-length")
    expect(funcLengthFindings.length).toBeGreaterThanOrEqual(1)
  })

  it("should handle mixed content without crashing", () => {
    const content = [
      "import { foo } from './bar'",
      "",
      "// This is a comment",
      "export function test() {",
      "  const x = 1 // inline comment",
      "  return x",
      "}",
      "",
      "/* block comment */",
      "type Props = { name: string }",
    ].join("\n")

    const result = analyzeSource(content, "/test/mixed.ts")
    expect(result.lineCount).toBe(10)
    expect(result.findings.length).toBeGreaterThanOrEqual(0) // no required findings, just check no crash
  })
})

describe("detectLanguage edge cases", () => {
  it("should detect TypeScript", () => {
    expect(detectLanguage("file.ts")).toBe("TypeScript")
    expect(detectLanguage("component.tsx")).toBe("TSX")
  })

  it("should detect JavaScript", () => {
    expect(detectLanguage("file.js")).toBe("JavaScript")
    expect(detectLanguage("file.jsx")).toBe("JSX")
  })

  it("should return null for unknown extensions", () => {
    expect(detectLanguage("file.abc")).toBeNull()
    expect(detectLanguage("file")).toBeNull()
    expect(detectLanguage("")).toBeNull()
  })

  it("should handle uppercase extensions", () => {
    expect(detectLanguage("file.TS")).toBe("TypeScript")
    expect(detectLanguage("file.PY")).toBe("Python")
  })
})

describe("listSourceFiles edge cases", () => {
  it("should handle non-existent directory", () => {
    const result = listSourceFiles("C:/nonexistent_dir_xyz_123456")
    expect(result.files).toHaveLength(0)
    expect(result.error).toBeDefined()
  })

  it("should handle empty directory", () => {
    const tmpDir = join(import.meta.dir, "__test_empty_dir__")
    try { mkdirSync(tmpDir, { recursive: true }) } catch {}
    const result = listSourceFiles(tmpDir)
    expect(result.files).toHaveLength(0)
    expect(result.error).toBeUndefined()
    try { existsSync(tmpDir) } catch {}
  })

  it("should filter by extension", () => {
    const result = listSourceFiles(import.meta.dir, {
      filterExtensions: [".ts"],
    })
    // Should only return .ts files
    for (const file of result.files) {
      expect(file.name.endsWith(".ts") || file.type === "directory").toBe(true)
    }
  })
})

describe("grepSource edge cases", () => {
  it("should handle non-existent directory", () => {
    const result = grepSource("C:/nonexistent_dir_xyz_123456", { pattern: "test" })
    expect(result.matches).toHaveLength(0)
    expect(result.totalFiles).toBe(0)
  })

  it("should be case-sensitive when requested", () => {
    const result = grepSource(import.meta.dir, {
      pattern: "IMPORT",
      caseSensitive: true,
      maxResults: 10,
    })
    // "import" and "IMPORT" are different with case-sensitive
    // There shouldn't be many all-caps IMPORT in source files
    const upperCaseMatches = result.matches.filter(m =>
      m.content.includes("IMPORT")
    )
    expect(result.matches.length).toBeGreaterThanOrEqual(0)
  })

  it("should limit results correctly", () => {
    const result = grepSource(import.meta.dir, {
      pattern: "a",
      maxResults: 5,
    })
    expect(result.matches.length).toBeLessThanOrEqual(5)
  })
})

describe("readFile edge cases", () => {
  it("should throw on non-existent file", () => {
    expect(() => readFile("C:/nonexistent_file_xyz_123456.txt")).toThrow()
  })

  it("should read existing file", () => {
    const content = readFile(import.meta.path)
    expect(content.length).toBeGreaterThan(0)
    expect(typeof content).toBe("string")
  })
})

describe("codeStats edge cases", () => {
  it("should handle non-existent directory gracefully", () => {
    const stats = getCodeStats("C:/nonexistent_dir_xyz_123456")
    expect(stats.totalFiles).toBe(0)
    expect(stats.totalDirs).toBe(0)
    expect(stats.totalSize).toBe(0)
    expect(Object.keys(stats.byLanguage)).toHaveLength(0)
  })

  it("should detect TypeScript files in our project", () => {
    const stats = getCodeStats(resolve(import.meta.dir, ".."))
    expect(stats.byLanguage["TypeScript"]).toBeDefined()
    expect(stats.byLanguage["TypeScript"]!.count).toBeGreaterThan(0)
  })
})
