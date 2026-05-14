# Technology Implementation Roadmap: OpenCode Plugin for Static Analysis

## Executive Summary

This roadmap outlines the implementation of an OpenCode plugin that provides static code analysis capabilities, starting with a demo MVP and progressing toward Klocwork-like advanced analysis features (data flow, interprocedural tracking, pointer analysis).

---

## 1. Architecture Overview

### System Design

The plugin follows OpenCode's plugin architecture pattern where:
- Plugin receives `PluginInput` with client, project, directory context
- Plugin exports `Hooks` object with lifecycle callbacks and tool definitions
- Tools are registered via the `tool` hook and called by the LLM agent

```
┌─────────────────────────────────────────────────────────────┐
│                        OpenCode Runtime                      │
├─────────────────────────────────────────────────────────────┤
│  Plugin Loader  │  Event Bus  │  Tool Registry  │  Client   │
└────────┬────────┴─────────────┴────────┬────────┴────┬───────┘
         │                               │             │
         ▼                               ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Static Analysis Plugin                    │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Plugin Main  │  │ Analysis     │  │ Tool Definitions │  │
│  │ (init/       │  │ Engine       │  │ (analyze,        │  │
│  │  activate)   │  │ (AST/CFG/    │  │  getFindings)    │  │
│  └──────────────┘  │  DataFlow)    │  └──────────────────┘  │
│                    └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack Recommendations

### Language & Runtime
- **Primary**: TypeScript (aligned with OpenCode's ecosystem)
- **Runtime**: Bun (OpenCode's runtime) with Node.js fallback for compatibility

### Analysis Libraries
| Purpose | Library | Rationale |
|---------|---------|------------|
| AST Parsing | `typescript` (compiler API) | Native TS support, no custom parser needed |
| AST Traversal | `ts-morph` or custom walker | TypeScript-focused, easy API |
| Pattern Matching | `ts-query` / regex-based | Simple rule definitions |
| Code Analysis | Custom implementation | Full control over data flow algorithms |

### Tooling
- **Bundler**: `esbuild` or `bun build` for fast compilation
- **Testing**: `vitest` with TypeScript support
- **Package Format**: `.zip` containing `plugin.json` + bundled JS

---

## 3. Implementation Phases

### Phase 0: IMMEDIATE - Explore OpenCode Plugin APIs

**Goal**: Understand and map OpenCode's extension mechanisms

**Approach**:
1. Read existing plugin source code from `@opencode-ai/plugin` package
2. Study skill registration and MCP server patterns
3. Map available hooks to our use cases

**Key Files to Understand**:
- `packages/plugin/src/index.ts` - Hook definitions
- `packages/opencode/src/plugin/index.ts` - Plugin loader
- Skill implementations in `.config/opencode/skills/`

**Effort**: S (1-2 days)

---

### Phase 1: DEMO MVP - Working Plugin Skeleton

**Goal**: Create a plugin that can be installed, activated, and respond to API calls

**Approach**:
1. Create plugin package structure with `plugin.json` manifest
2. Implement basic hooks: `init`, `activate`, `ping`
3. Register a demo tool that returns simple analysis results
4. Test installation and tool invocation

**Key Files to Create**:
```
static-analysis-plugin/
├── plugin.json          # Manifest with metadata, entry point
├── src/
│   ├── index.ts         # Main plugin entry, Hooks export
│   ├── tools/
│   │   └── analyze.ts   # Demo tool implementation
│   └── api/
│       └── client.ts    # Wrapper around opencode client
├── package.json
└── tsconfig.json
```

**Interface Definitions**:

```typescript
// plugin.json structure
interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  entry: string          // Main JS file
  dependencies?: Record<string, string>
  hooks?: string[]       // ["tool", "event", "config"]
}

// Core tool interface
interface AnalyzeTool {
  execute(input: {
    filePath: string
    options?: {
      depth?: "shallow" | "deep"
      patterns?: string[]
    }
  }): Promise<{
    findings: Finding[]
    summary: string
  }>
}

interface Finding {
  severity: "error" | "warning" | "info"
  message: string
  location: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  ruleId?: string
}
```

**Dependencies**: 
- `@opencode-ai/sdk` - For type definitions and client creation

**Effort**: S (1-2 days for skeleton, 2-3 days for working demo)

---

### Phase 2: FOUNDATION - Basic Analysis Capabilities

**Goal**: AST parsing and simple pattern matching

**Approach**:
1. Integrate TypeScript compiler API for source parsing
2. Implement AST node traversal
3. Create rule engine for pattern definitions
4. Add file watching capability via hooks

**Key Files to Create/Modify**:
```
src/
├── parser/
│   ├── index.ts         # Parser entry point
│   ├── ast-builder.ts   # TypeScript AST creation
│   └── ast-walker.ts    # Tree traversal utilities
├── rules/
│   ├── index.ts         # Rule registry
│   ├── rule-engine.ts   # Pattern matching engine
│   └── built-in/
│       ├── no-var.ts    # Example: no-var rule
│       └── unused-vars.ts
├── analyzer/
│   └── index.ts         # Main analysis orchestration
└── hooks/
    └── file-watcher.ts  # File change monitoring
```

**Dependencies**:
- `typescript` (^5.x) - AST generation
- `ts-morph` (optional, for easier AST manipulation)

**Technical Approach**:
- Use TypeScript's `createSourceFile()` for parsing
- Walk AST with visitor pattern
- Rules defined as: `{ pattern: ASTNodeType, match: (node) => boolean }`

**Effort**: M (3-5 days)

---

### Phase 3: ADVANCED - Data Flow & Interprocedural Analysis

**Goal**: Klocwork-like capabilities - data flow, interprocedural tracking, pointer analysis

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                    Analysis Pipeline                         │
├─────────────────────────────────────────────────────────────┤
│  Source → Parser → AST → CFG → DataFlow → Results          │
│                            ↓                                 │
│                   Interprocedural Engine                    │
│                            ↓                                 │
│                   Pointer/Alias Analysis                    │
└─────────────────────────────────────────────────────────────┘
```

**Key Components**:

1. **CFG Generation** (`src/analysis/cfg/`)
   - Build control flow graphs from AST
   - Identify basic blocks, branches, loops
   - Handle exception edges

2. **Data Flow Analysis** (`src/analysis/dataflow/`)
   - Reaching definitions analysis
   - Def-use chain construction
   - Live variable analysis
   - Constant propagation

3. **Interprocedural Analysis** (`src/analysis/interprocedural/`)
   - Call graph construction
   - Context-sensitive analysis
   - Summary-based approach for efficiency

4. **Pointer Analysis** (`src/analysis/pointer/`)
   - Alias detection
   - Type-based points-to analysis
   - Heap object modeling

**Key Files to Create**:
```
src/analysis/
├── cfg/
│   ├── builder.ts       # CFG generation
│   └── types.ts         # Block, Edge, ControlFlowGraph
├── dataflow/
│   ├── solver.ts        # Data flow equation solver
│   ├── reaching-defs.ts
│   ├── liveness.ts
│   └── def-use.ts
├── interprocedural/
│   ├── call-graph.ts    # Function call relationships
│   ├── summary.ts       # Function summaries
│   └── context.ts       # Analysis context
└── pointer/
    ├── alias.ts         # Alias analysis
    └── points-to.ts     # Points-to sets
```

**Dependencies**:
- `typescript` - Full compiler API access
- Custom implementations for analysis algorithms

**Effort**: L (1-3 weeks)

---

## 4. Phase Summary Table

| Phase | Focus | Key Deliverables | Effort |
|-------|-------|------------------|--------|
| Phase 0 | API Exploration | Understanding of plugin system | S |
| Phase 1 | Demo MVP | Working plugin with basic tool | S |
| Phase 2 | Foundation | AST + pattern matching | M |
| Phase 3 | Advanced | Data flow, interprocedural, pointer | L |

---

## 5. Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Plugin API instability** | High | Use only stable hooks; version pin OpenCode dependency |
| **Performance with large codebases** | Medium | Implement incremental analysis, caching |
| **TypeScript compiler API complexity** | Medium | Start with simpler rules; gradually add complex analysis |
| **Memory usage for interprocedural** | High | Use summary-based approach, limit analysis depth |
| **Cross-language support** | Low | Start with TypeScript-only; add others later |
| **OpenCode version compatibility** | Medium | Test against target OpenCode version; add version checks |

---

## 6. Architecture Diagram (ASCII)

```
                    ┌──────────────────────────────────────┐
                    │         OpenCode Runtime            │
                    │  ┌────────┐  ┌──────┐  ┌─────────┐ │
                    │  │ Loader │  │ Hooks │  │ Tools   │ │
                    │  └────┬───┘  └──┬───┘  └────┬────┘ │
                    └───────┼─────────┼────────────┼──────┘
                            │         │            │
                    ┌───────▼─────────▼────────────▼──────┐
                    │        Plugin Interface              │
                    │  ┌─────────────────────────────────┐ │
                    │  │ Plugin: (input) => Hooks        │ │
                    │  │  ├─ init()                       │ │
                    │  │  ├─ activate()                   │ │
                    │  │  ├─ tool: { analyze, query }    │ │
                    │  │  └─ event: (handler)            │ │
                    │  └─────────────────────────────────┘ │
                    └────────────────┬─────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Parser Layer  │  │  Analysis Engine │  │   Tool Layer    │
│                 │  │                 │  │                 │
│ - TypeScript    │  │ - Rule Engine   │  │ - analyze()     │
│   Parser        │  │ - CFG Builder   │  │ - findRefs()    │
│ - AST Walker    │  │ - Data Flow    │  │ - getSymbols()  │
│ - Source Maps  │  │ - Interproc    │  │ - checkRules()  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 7. Key Interface Definitions

### Plugin Main Interface

```typescript
import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin"
import type { ToolDefinition } from "./types"

export const plugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const { client, project, directory } = input

  return {
    // Lifecycle
    config: async (config) => { /* apply config */ },
    tool: {
      // Core analysis tool
      "static-analyze": {
        description: "Perform static code analysis on a file or project",
        parameters: {
          type: "object",
          properties: {
            target: { type: "string", description: "File or directory to analyze" },
            rules: { type: "array", items: { type: "string" }, description: "Rule IDs to apply" },
            depth: { type: "string", enum: ["shallow", "deep"], default: "shallow" }
          },
          required: ["target"]
        },
        execute: async (args, ctx) => {
          // Implementation
        }
      }
    }
  }
}
```

### Analysis Result Interface

```typescript
interface AnalysisResult {
  success: boolean
  findings: Finding[]
  metrics: AnalysisMetrics
  artifacts?: {
    cfg?: ControlFlowGraph
    dataFlow?: DataFlowResult
  }
}

interface Finding {
  id: string
  severity: "error" | "warning" | "info" | "hint"
  message: string
  location: Location
  rule: string
  code?: string
  suggestions?: Correction[]
}

interface Location {
  file: string
  start: Position
  end: Position
}

interface Position {
  line: number
  column: number
  offset?: number
}
```

### Data Flow Interfaces

```typescript
interface ControlFlowGraph {
  entry: string
  exit: string
  blocks: Map<string, BasicBlock>
  edges: Edge[]
}

interface BasicBlock {
  id: string
  statements: Statement[]
  predecessors: string[]
  successors: string[]
}

interface DataFlowResult {
  reachingDefinitions: Map<string, Definition[]>
  liveVariables: Map<string, Set<string>>
  defUseChains: Map<string, DefinitionUse[]>
}
```

---

## 8. Next Steps

1. **Immediate (Phase 0)**: Clone OpenCode repo, study plugin package
2. **Week 1 (Phase 1)**: Create demo plugin with working tool registration
3. **Week 2-3 (Phase 2)**: Implement AST parsing and basic rules
4. **Month 1-2 (Phase 3)**: Add data flow and interprocedural analysis

---

*Generated: 2026-05-11*
*Based on: C:\work\plugin4opencode\backlog.md*