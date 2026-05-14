# Static Analysis Plugin for OpenCode

An OpenCode plugin providing source code analysis tools and C++ Data Flow Analysis (DFA).
Built with the official `@opencode-ai/plugin` SDK.

## Tools (v0.4.0)

### Core Analysis (v0.1.0)

#### `analyze_file`
Deep analysis of a single source file:
- File statistics (lines, size, language)
- TODO/FIXME/HACK/XXX comment detection
- Long line warnings (>120 chars)
- Trailing whitespace detection
- Long function/block detection

#### `list_source_files`
List source files in a directory:
- Shows file names, types, sizes, and detected languages
- Supports 30+ language detection by extension
- Skips hidden files and `node_modules` by default

#### `grep_source`
Search for patterns in source code:
- Case-insensitive search by default
- Configurable file type filters
- Returns file paths, line numbers, and matching content
- Recursive directory search with sensible exclusions

#### `code_stats`
Get code statistics for a project:
- Total files, directories, and size
- Breakdown by programming language
- Shows project composition at a glance

### Advanced Analysis (v0.2.0)

#### `analyze_imports`
Import/export dependency analysis for TypeScript/JavaScript:
- Parsed import statements and export declarations
- External npm dependency detection
- Internal relative dependency resolution
- Unresolved import detection
- Circular dependency detection

#### `find_unused_exports`
Cross-file unused export detection:
- Scans all source files for exports
- Checks each export against all imports across the project
- Entry point and config files auto-excluded
- Results sorted by likelihood of being unused

#### `analyze_complexity`
Cyclomatic complexity and function metrics:
- Per-function analysis (name, line count, params, complexity, nesting depth, return count)
- Average complexity across all functions
- Overall maintainability score (0-100)
- Identifies complex functions needing refactoring

### C++ Data Flow Analysis (v0.3.0+)

#### `trace_variable`
**C++ variable data flow tracing** — three-tier DFA pipeline:

- **v4 Cross-File** (v0.4.0): Analyze across `.cpp`/`.h`/`.hpp` files in a workspace. Traces variable flow across file boundaries via parameter/argument mapping and return value capture. Optional `directory` param enables workspace-wide analysis.
- **v3 Interprocedural**: Cross-function tracing within a single file. Follows variable flow through function calls, parameters, and return values. Handles call chains up to 3 levels deep.
- **v2 AST-based**: Single-function analysis using tree-sitter WASM AST parser. Supports pointers, arrays, structs, templates, and modern C++.
- **v1 Line-scan**: Regex-based fallback with ~85% coverage. Zero external dependencies, always available.

Automatic fallback chain: v4 → v3 → v2 → v1. Each tier degrades gracefully.

## Installation

### From local package
```bash
opencode plugin ./static-analysis-plugin-0.4.0.tgz -g
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run type-check

# Test
bun test

# Pack for distribution
npm pack
```

## Architecture

```
Plugin (async function)
  └─ Hooks
      └─ tool
          ├─ analyze_file
          ├─ list_source_files
          ├─ grep_source
          ├─ code_stats
          ├─ analyze_imports
          ├─ find_unused_exports
          ├─ analyze_complexity
          └─ trace_variable  [v4→v3→v2→v1 DFA pipeline]
```

### C++ DFA Pipeline Architecture

```
trace_variable(directory?)  ← optional directory for cross-file
  │
  ├─▶ v4 [directory provided]
  │     scanCppFiles → analyzeWorkspace → traceCrossFile
  │     (global function registry across .cpp/.h/.hpp files)
  │
  ├─▶ v3 [single file, multiple functions]
  │     CppParser → buildFunctionCFGs → buildCallGraph
  │     → traceInterprocedural (recursive, maxDepth=3)
  │
  ├─▶ v2 [single function]
  │     CppParser → buildASTCFG → buildDefUseChains
  │     → analyzeDataFlow
  │
  └─▶ v1 [fallback, zero dependencies]
        buildCFG(line-scan) → buildDefUseChains → analyzeDataFlow
```

Each tool:
- Uses Zod schema for argument validation
- Receives `ToolContext` with session info, directory, and abort signal
- Returns `{ output, metadata }` structure
- Handles errors gracefully (never throws)

## Project Structure

```
src/
├── index.ts                           # Plugin entry — registers all 9 tools
├── utils/file-reader.ts               # File reading utilities
├── tools/
│   ├── analyze.ts                     # analyze_file core logic
│   ├── listing.ts                     # list_source_files + code_stats
│   ├── search.ts                      # grep_source implementation
│   ├── import-analysis.ts             # Import/export dependency analysis
│   ├── unused-exports.ts              # Cross-file unused export detection
│   ├── complexity.ts                  # Cyclomatic complexity analysis
│   └── cpp/
│       ├── cpp-cfg.ts                 # v1: Line-scan CFG builder
│       ├── cpp-dataflow.ts            # DFA engine (v1/v2/v3/v4 shared)
│       ├── cpp-parser.ts              # tree-sitter WASM parser (singleton)
│       ├── ast-to-cfg.ts              # v2: AST→CFG bridge
│       ├── cross-function-dfa.ts      # v3: Single-file interprocedural DFA
│       ├── cross-file-dfa.ts          # v4: Cross-file DFA engine
│       └── variable-trace.ts          # trace_variable tool (v4→v3→v2→v1)
└── __tests__/                         # 125+ tests
```
