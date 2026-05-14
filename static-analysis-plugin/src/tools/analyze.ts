export interface Finding {
  severity: "error" | "warning" | "info"
  message: string
  line: number
  column?: number
  ruleId?: string
}

export interface AnalysisResult {
  summary: string
  lineCount: number
  findings: Finding[]
}

/**
 * Analyze source code content and return findings.
 * Detects:
 * - TODO/FIXME/HACK comments
 * - Long lines (>120 chars)
 * - Trailing whitespace
 * - Very long functions (basic heuristic)
 */
export function analyzeSource(content: string, filePath: string): AnalysisResult {
  const lines = content.split("\n")
  const lineCount = lines.length
  const findings: Finding[] = []
  let todoCount = 0
  let longLineCount = 0
  let trailingSpaceCount = 0
  let inLongFunction = false
  let funcStartLine = 0
  let funcBraceCount = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i] ?? ""

    // TODO/FIXME/HACK detection
    const todoMatch = line.match(/\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/)
    if (todoMatch) {
      findings.push({
        severity: "info",
        message: `${todoMatch[1]} comment: ${line.trim()}`,
        line: lineNum,
        column: line.indexOf(todoMatch[1]!) + 1,
        ruleId: "comment-todo",
      })
      todoCount++
    }

    // Long line detection
    if (line.length > 120) {
      findings.push({
        severity: "warning",
        message: `Line exceeds 120 characters (${line.length} chars)`,
        line: lineNum,
        ruleId: "line-length",
      })
      longLineCount++
    }

    // Trailing whitespace detection
    if (line.length > 0 && line !== line.trimEnd()) {
      findings.push({
        severity: "info",
        message: "Line has trailing whitespace",
        line: lineNum,
        ruleId: "trailing-whitespace",
      })
      trailingSpaceCount++
    }

    // Basic long function detection (heuristic)
    const openBrace = (line.match(/{/g) || []).length
    const closeBrace = (line.match(/}/g) || []).length
    if (!inLongFunction && openBrace > 0 && /\b(function|class|method|def)\b/i.test(line)) {
      inLongFunction = true
      funcStartLine = lineNum
      funcBraceCount = openBrace - closeBrace
    } else if (inLongFunction) {
      funcBraceCount += openBrace - closeBrace
      if (funcBraceCount <= 0) {
        const funcLength = lineNum - funcStartLine
        if (funcLength > 100) {
          findings.push({
            severity: "warning",
            message: `Long function/block (${funcLength} lines) starting at line ${funcStartLine}`,
            line: funcStartLine,
            ruleId: "function-length",
          })
        }
        inLongFunction = false
        funcBraceCount = 0
      }
    }
  }

  // Build summary
  const parts: string[] = []
  parts.push(`File: ${filePath}`)
  parts.push(`Total lines: ${lineCount}`)

  if (todoCount > 0) {
    parts.push(`TODO/FIXME/HACK comments: ${todoCount}`)
  }
  if (longLineCount > 0) {
    parts.push(`Long lines (>120 chars): ${longLineCount}`)
  }
  if (trailingSpaceCount > 0) {
    parts.push(`Lines with trailing whitespace: ${trailingSpaceCount}`)
  }

  if (findings.length === 0) {
    parts.push("No issues found.")
  } else {
    parts.push(`Total findings: ${findings.length} (${findings.filter(f => f.severity === "error").length} errors, ${findings.filter(f => f.severity === "warning").length} warnings, ${findings.filter(f => f.severity === "info").length} info)`)
  }

  return {
    summary: parts.join("\n"),
    lineCount,
    findings,
  }
}
