/**
 * Demo script for C++ Data Flow Analysis
 *
 * Runs the DFA engine on the demo C++ file and prints trace results.
 * Run with: bun run demo/run-demo.ts
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { buildCFG, printCFG } from "../src/tools/cpp/cpp-cfg"
import { buildDefUseChains, analyzeDataFlow } from "../src/tools/cpp/cpp-dataflow"

const demoFile = resolve(import.meta.dir, "complex-flow.cpp")
const content = readFileSync(demoFile, "utf-8")
const sourceLines = content.split("\n")

console.log("=".repeat(70))
console.log("  C++ Data Flow Analysis Demo — v0.3.0")
console.log("=".repeat(70))
console.log()
console.log("Source file: complex-flow.cpp")
console.log(`Total lines: ${sourceLines.length}`)
console.log()

// Build CFG
const cfg = buildCFG(sourceLines, "main")
console.log("── Control Flow Graph ──")
console.log(`  Blocks: ${cfg.blocks.size}`)
for (const [id, block] of cfg.blocks) {
  const stmts = block.statements.map(s => `${s.type}: ${s.text}`).join(" | ")
  console.log(`  Block #${id} (L${block.startLine}-${block.endLine}): ${stmts}`)
}
console.log()

// Build def-use chains
const duInfo = buildDefUseChains(cfg, "complex-flow.cpp")
console.log("── Def-Use Chains ──")
console.log("  Definitions:")
for (const [varName, defs] of duInfo.definitions) {
  for (const def of defs) {
    console.log(`    ${varName} @ L${def.line}: ${def.statement}`)
  }
}
console.log("  Uses:")
for (const [varName, uses] of duInfo.uses) {
  for (const use of uses) {
    console.log(`    ${varName} @ L${use.line}: ${use.statement}`)
  }
}
console.log()

// == DEMO 1: Forward trace from 'a' ==
console.log("─".repeat(70))
console.log("DEMO 1: Forward trace from 'a'")
console.log("  int a = 10;")
console.log("  ↓")
showTrace(analyzeDataFlow(cfg, duInfo, "a", undefined, "forward", "complex-flow.cpp"))

// == DEMO 2: Backward trace to 'g' ==
console.log("─".repeat(70))
console.log("DEMO 2: Backward trace from 'g'")
console.log("  int g = f - 5;")
console.log("  ↑ (where did g's value come from?)")
showTrace(analyzeDataFlow(cfg, duInfo, "g", undefined, "backward", "complex-flow.cpp"))

// == DEMO 3: Both directions from 'b' ==
console.log("─".repeat(70))
console.log("DEMO 3: Bidirectional trace from 'b' (center of chain)")
console.log("  int b = a + 5;")
console.log("  ↓ what does b affect?  ↑ where did b come from?")
showTrace(analyzeDataFlow(cfg, duInfo, "b", undefined, "both", "complex-flow.cpp"))

// == DEMO 4: Pointer trace from 'x' ==
console.log("─".repeat(70))
console.log("DEMO 4: Forward trace from 'x' (pointer indirection)")
console.log("  int x = 42; → int* p = &x; → int y = *p; → int z = y + 1;")
showTrace(analyzeDataFlow(cfg, duInfo, "x", undefined, "forward", "complex-flow.cpp"))

// == DEMO 5: Summary of all variables ==
console.log("─".repeat(70))
console.log("DEMO 5: Variables summary")
console.log(`  Total variables tracked: ${duInfo.definitions.size}`)
const sortedVars = [...duInfo.definitions.keys()].sort()
for (const v of sortedVars) {
  const defs = duInfo.definitions.get(v)!
  const uses = duInfo.uses.get(v) || []
  console.log(`  ${v}: defined @ L${defs.map(d => d.line).join(", ")}, used @ L${uses.map(u => u.line).join(", ")}`)
}

console.log()
console.log("=".repeat(70))
console.log("  Demo complete! All traces show variable flow chains.")
console.log("=".repeat(70))

function showTrace(result: ReturnType<typeof analyzeDataFlow>) {
  console.log()
  console.log(`  Start variable: ${result.startVariable}`)
  console.log(`  Direction: ${result.direction}`)
  console.log()

  if (result.edges.length === 0) {
    console.log("  ⚠ No data flow detected.")
    console.log()
    return
  }

  // Show flow chain
  const chain = buildChain(result)
  console.log(`  Flow chain:`)
  console.log(`    ${chain}`)
  console.log()

  // Show detailed edges
  console.log(`  ${result.edges.length} flow edge(s):`)
  for (const edge of result.edges) {
    const arrow = result.direction === "backward" ? "←" : "→"
    console.log(`    L${edge.fromLine}:${edge.fromVar} ${arrow} L${edge.toLine}:${edge.toVar}  [${edge.edgeType}]`)
    console.log(`      "${edge.fromStatement}"`)
  }
  console.log()
  console.log(`  All variables: ${result.allVariables.join(", ")}`)
  console.log()
}

function buildChain(result: ReturnType<typeof analyzeDataFlow>): string {
  const adj = new Map<string, string[]>()
  for (const edge of result.edges) {
    const existing = adj.get(edge.fromVar) || []
    existing.push(edge.toVar)
    adj.set(edge.fromVar, existing)
  }

  const chain: string[] = [result.startVariable]
  const visited = new Set<string>([result.startVariable])

  // Forward chain from startVariable
  let current = result.startVariable
  for (let i = 0; i < 20; i++) {
    const next = adj.get(current)
    if (!next || next.length === 0) break
    const nextVar = next[0]!
    if (visited.has(nextVar)) break
    chain.push(nextVar)
    visited.add(nextVar)
    current = nextVar
  }

  if (result.direction === "backward") {
    return chain.join(" ← ")
  }
  return chain.join(" → ")
}
