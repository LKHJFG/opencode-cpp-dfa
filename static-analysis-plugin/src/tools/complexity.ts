export interface FunctionInfo {
  name: string
  line: number
  lineCount: number
  params: number
  cyclomaticComplexity: number
  nestingDepth: number
  returnCount: number
}

export interface ComplexityResult {
  functions: FunctionInfo[]
  functionCount: number
  averageComplexity: number
  highestComplexity: FunctionInfo | null
  fileSummary: string
  overallScore: number
}

/**
 * Analyze cyclomatic complexity and function metrics for source code.
 *
 * Cyclomatic complexity = number of decision points + 1
 * Decision points: if, else if, for, while, case, &&, ||, catch, ternary
 *
 * Uses regex-based parsing — covers common patterns without a full AST parser.
 */
export function analyzeComplexity(content: string, filePath: string): ComplexityResult {
  const lines = content.split("\n")
  const functions: FunctionInfo[] = []
  let inFunction = false
  let funcName = ""
  let funcStart = 0
  let funcBraceDepth = 0
  let funcParams = 0
  let funcComplexity = 0
  let funcReturns = 0
  let funcNesting = 0
  let currentNesting = 0

  // Track nesting via indentation-based heuristic (for non-brace languages) + brace counting
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]!

    // Skip comments and empty lines
    const trimmed = line.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed === "") continue

    // Detect function/class/method start
    const funcMatch = trimmed.match(
      /^(?:export\s+)?(?:async\s+)?(?:function\s+\*?\s*(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(|=>))/,
    ) || trimmed.match(
      /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
    ) || trimmed.match(
      /^(\w+)\s*\([^)]*\)\s*{/,
    ) || trimmed.match(
      /^(?:public|private|protected)\s+(?:static\s+)?(?:async\s+)?(\w+)\s*\(/,
    )

    if (funcMatch && !inFunction) {
      const name = funcMatch[1] || funcMatch[2] || funcMatch[3] || "(anonymous)"
      inFunction = true
      funcName = name
      funcStart = lineNum
      funcBraceDepth = 0
      funcComplexity = 1  // base complexity
      funcReturns = 0
      funcParams = countParams(trimmed)
      currentNesting = 0
      funcNesting = 0

      // Count opening braces on the same line
      funcBraceDepth += (trimmed.match(/{/g) || []).length
      funcBraceDepth -= (trimmed.match(/}/g) || []).length
      continue
    }

    if (inFunction) {
      // Count decision points for cyclomatic complexity
      funcComplexity += countDecisionPoints(trimmed)

      // Count returns
      if (/\breturn\b/.test(trimmed) && !trimmed.includes("return new")) {
        funcReturns++
      }

      // Track nesting depth
      const openBraces = (trimmed.match(/{/g) || []).length
      const closeBraces = (trimmed.match(/}/g) || []).length
      funcBraceDepth += openBraces - closeBraces

      // Approximate nesting by counting indent level for first line of blocks
      const indentLevel = countIndent(line)

      if (openBraces > 0 && /\b(if|for|while|switch|catch|do|try)\b/.test(trimmed)) {
        currentNesting++
        funcNesting = Math.max(funcNesting, currentNesting)
      }
      if (closeBraces > 0 && /\b(if|for|while|switch|catch|do|try)\b/.test(trimmed)) {
        currentNesting = Math.max(0, currentNesting - 1)
      }

      // Function end (brace depth returns to 0, but not at export level)
      if (funcBraceDepth <= 0 && openBraces === 0 && closeBraces > 0) {
        functions.push({
          name: funcName,
          line: funcStart,
          lineCount: lineNum - funcStart + 1,
          params: funcParams,
          cyclomaticComplexity: funcComplexity,
          nestingDepth: funcNesting,
          returnCount: funcReturns,
        })
        inFunction = false
        funcBraceDepth = 0
      }
    }
  }

  // Function ended without closing brace (eof or single-expression arrow function)
  if (inFunction) {
    functions.push({
      name: funcName,
      line: funcStart,
      lineCount: lines.length - funcStart + 1,
      params: funcParams,
      cyclomaticComplexity: funcComplexity,
      nestingDepth: funcNesting,
      returnCount: funcReturns,
    })
  }

  // Calculate statistics
  const totalComplexity = functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0)
  const averageComplexity = functions.length > 0 ? Math.round((totalComplexity / functions.length) * 10) / 10 : 0
  const highestComplexity = functions.length > 0
    ? functions.reduce((max, f) => f.cyclomaticComplexity > max.cyclomaticComplexity ? f : max, functions[0]!)
    : null

  // Overall score: 100 - normalized complexity (0-100)
  const maxComplexity = Math.max(...functions.map(f => f.cyclomaticComplexity), 0)
  const score = functions.length > 0
    ? Math.max(0, Math.min(100, Math.round(100 - (averageComplexity * 5))))
    : 100

  // Build summary
  const parts: string[] = []
  parts.push(`File: ${filePath}`)
  parts.push(`Functions found: ${functions.length}`)
  parts.push(`Average complexity: ${averageComplexity}`)
  parts.push(`Highest complexity: ${highestComplexity ? `${highestComplexity.name} (${highestComplexity.cyclomaticComplexity})` : "N/A"}`)
  parts.push(`Overall maintainability score: ${score}/100`)
  parts.push("")

  if (functions.length > 0) {
    parts.push("Function details:")

    // Sort by complexity (highest first)
    const sorted = [...functions].sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)

    for (const f of sorted) {
      const riskLabel = f.cyclomaticComplexity > 20 ? "⚠️ HIGH" :
        f.cyclomaticComplexity > 10 ? "⚠️ MEDIUM" : "✅ LOW"
      parts.push(
        `  ${f.name} (line ${f.line}, ${f.lineCount} lines)` +
        `  params:${f.params} complexity:${f.cyclomaticComplexity} ${riskLabel}`,
      )
    }
  }

  return {
    functions,
    functionCount: functions.length,
    averageComplexity,
    highestComplexity,
    fileSummary: parts.join("\n"),
    overallScore: score,
  }
}

function countDecisionPoints(line: string): number {
  let count = 0

  // if / else if
  const ifMatches = line.match(/\bif\s*\(/g)
  if (ifMatches) count += ifMatches.length

  // else if (additional decision)
  const elseIfMatches = line.match(/\belse\s+if\b/g)
  if (elseIfMatches) count += elseIfMatches.length

  // for, while, do-while
  const loopMatches = line.match(/\b(for|while)\s*\(/g)
  if (loopMatches) count += loopMatches.length

  // case statements (each case is a branch)
  const caseMatches = line.match(/\bcase\s+/g)
  if (caseMatches) count += caseMatches.length

  // catch
  const catchMatches = line.match(/\bcatch\s*\(/g)
  if (catchMatches) count += catchMatches.length

  // ternary operator
  const ternaryMatches = line.match(/\?[^:]*:/g)
  if (ternaryMatches) count += ternaryMatches.length

  // Logical operators that create branches: &&, ||
  const andOrMatches = line.match(/&&|\|\|/g)
  if (andOrMatches) count += andOrMatches.length

  return count
}

function countParams(funcDecl: string): number {
  const parenMatch = funcDecl.match(/\(([^)]*)\)/)
  if (!parenMatch) return 0

  const params = parenMatch[1]!.trim()
  if (params === "") return 0

  // Count comma-separated params, handling destructuring and defaults
  let depth = 0
  let paramCount = 0
  for (const char of params) {
    if (char === "{" || char === "[" || char === "(") depth++
    else if (char === "}" || char === "]" || char === ")") depth--
    else if (char === "," && depth === 0) paramCount++
  }
  return paramCount + 1
}

function countIndent(line: string): number {
  const match = line.match(/^(\s*)/)
  if (!match) return 0
  return Math.floor(match[1]!.length / 2) // assuming 2-space indent
}
