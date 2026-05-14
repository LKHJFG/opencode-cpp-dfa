# Contributing to Static Analysis Plugin

## Development Setup

```bash
# Install dependencies
bun install

# Build the plugin
bun run build

# Run tests
bun test

# Type checking
bun run type-check
```

## Project Structure

```
src/
  index.ts           # Plugin entry point, tool registration
  tools/             # Tool implementations
    analyze.ts       # analyze_file tool
    listing.ts       # list_source_files, code_stats, detectLanguage
    search.ts        # grep_source tool
    import-analysis.ts    # analyze_imports tool
    unused-exports.ts     # find_unused_exports tool
    complexity.ts    # analyze_complexity tool
    cpp/             # C++ DFA engine
      variable-trace.ts    # trace_variable tool entry point
      cpp-parser.ts        # tree-sitter WASM integration
      cpp-cfg.ts           # Control Flow Graph construction
      cpp-dataflow.ts      # v2 AST-based data flow
      cross-function-dfa.ts # v3 interprocedural analysis
      cross-file-dfa.ts    # v4 cross-file analysis
  utils/             # Shared utilities
  __tests__/         # Test files
```

## Architecture Overview

### Tool Registration

Tools are defined in `src/index.ts` using the `@opencode-ai/plugin` SDK. Each tool is registered with:
- Description and argument schema
- Execute function that receives args and context

### C++ DFA Engine Tiers

The `trace_variable` tool implements a tiered fallback strategy:

- **v1 (Regex-based)**: Simple pattern matching, fast but limited
- **v2 (AST-based)**: Uses tree-sitter WASM parser for single-function analysis. Supports pointers, arrays, structs, templates
- **v3 (Cross-function)**: Interprocedural analysis within a file. Follows variable flow through function calls up to 3 levels deep
- **v4 (Cross-file)**: Enabled when `directory` argument is provided. Traces variable flow across `.cpp`/`.h`/`.hpp` files via parameter/argument mapping

The tool automatically falls back: v4 -> v3 -> v2 -> v1 based on context complexity.

### Testing

Tests use `bun:test` and are located in `src/__tests__/`. Run all tests with `bun test`.

## Adding a New Tool

1. **Create the tool file** in `src/tools/` (or `src/tools/cpp/` for C++-specific tools)
2. **Implement the tool function** with proper TypeScript types
3. **Register in `src/index.ts`**:
   ```typescript
   toolName: tool({
     description: "...",
     args: { ... },
     async execute(args, context) { ... }
   })
   ```
4. **Create tests** in `src/__tests__/` following the existing patterns
5. **Run `bun test`** to verify

## Testing Guidelines

### Running Tests

```bash
bun test              # Run all tests
bun test src/__tests__/specific.test.ts  # Run specific file
```

### DFA Tests

DFA tests use C++ fixture strings and mock contexts:
- `cpp-analysis.test.ts` - Basic AST parsing and v2 analysis
- `cross-function-dfa.test.ts` - v3 interprocedural tracing
- `cross-file-dfa.test.ts` - v4 workspace-wide analysis
- `fallback-integration.test.ts` - v3->v2->v1 fallback chain verification
- `v2-v1-consistency.test.ts` - Ensures v2 and v1 produce consistent results

### Trace Tests

Trace tests verify the fallback chain works correctly:
- Tests should exercise v3 -> v2 -> v1 fallback when features aren't available
- Use mock contexts to simulate different analysis contexts
- Include edge cases in `edge-cases.test.ts`

## Code Style

- Use TypeScript with strict typing
- **Do not use `as any`** in source files. Prefer proper types over casts
- Follow existing patterns in the codebase
- Run `bun run type-check` before committing

## Pull Request Process

1. Create a branch from main
2. Make your changes following the code style guidelines
3. Add tests for new functionality
4. Run `bun test` and `bun run type-check`
5. Open a pull request with a clear description of changes

## Common Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run build` | Build for distribution |
| `bun run type-check` | Type check with TypeScript |
| `bun test` | Run all tests |
| `bun run package` | Create distribution zip |