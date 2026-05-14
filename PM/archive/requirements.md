# Requirements Document: OpenCode Plugin Demo Phase

## 1. Introduction

### 1.1 Purpose
This document defines the functional and non-functional requirements for Phase 1 (DEMO/MVP) of the OpenCode Static Analysis Plugin.

### 1.2 Scope
The DEMO phase focuses on creating a minimal working plugin that demonstrates the core plugin architecture: installation, activation, tool registration, and API integration.

### 1.3 References
- Product Opportunity Backlog: `C:\work\plugin4opencode\backlog.md`
- Technology Implementation Roadmap: `C:\work\plugin4opencode\roadmap.md`

---

## 2. Functional Requirements

### 2.1 Plugin Architecture

#### FR-001: Plugin Package Structure
The plugin SHALL be packaged as a distributable archive containing:
- `plugin.json` manifest file with metadata
- Bundled JavaScript entry point
- TypeScript source files for maintainability

#### FR-002: Plugin Manifest
The plugin SHALL include a `plugin.json` manifest with the following fields:
- `name`: Plugin identifier (must be unique)
- `version`: Semantic version (e.g., "1.0.0")
- `description`: Brief description of plugin functionality
- `author`: Plugin author information
- `entry`: Relative path to main entry point
- `hooks`: Array of supported hooks (minimum: `["init", "activate", "tool"]`)

#### FR-002.1: Manifest Schema Validation
The plugin loader SHALL validate the manifest schema on installation and reject plugins with invalid or missing required fields.

### 2.2 Plugin Lifecycle

#### FR-003: Initialization Hook
The plugin SHALL export an `init(config)` function that:
- Receives configuration object with `client`, `project`, `directory` context
- Returns a promise that resolves when initialization is complete
- Handles errors gracefully and returns meaningful error messages

#### FR-004: Activation Hook
The plugin SHALL export an `activate()` function that:
- Transitions the plugin to active state
- Registers all provided tools with OpenCode's tool registry
- Returns a promise that resolves when activation is complete

#### FR-005: Deactivation Hook
The plugin SHALL export a `deactivate()` function that:
- Performs cleanup operations (release resources, close connections)
- Unregisters all registered tools
- Returns a promise that resolves when deactivation is complete

#### FR-006: Health Check API
The plugin SHALL expose a `ping()` method that:
- Returns `{ status: "ok" }` when plugin is operational
- Returns `{ status: "error", message: string }` when plugin has issues
- Does not require any input parameters

### 2.3 Tool Registration and Execution

#### FR-007: Tool Definition
The plugin SHALL support tool definitions with the following structure:
```typescript
interface ToolDefinition {
  name: string          // Unique tool identifier
  description: string   // Human-readable description for LLM
  inputSchema: object   // JSON Schema for tool arguments
  execute: (input: object) => Promise<ToolResult>
}
```

#### FR-008: Tool Registration
The plugin SHALL register tools during the `activate()` phase by:
- Creating a `tools` object mapping tool names to tool definitions
- Exporting via the `Hooks` interface

#### FR-009: Demo Tool - Basic Analysis
The plugin SHALL implement at least one demo tool named `analyze-file` that:
- Accepts `filePath` (required string) parameter
- Reads the file content from the workspace
- Returns analysis results with the following structure:
```typescript
{
  findings: Array<{
    severity: "error" | "warning" | "info"
    message: string
    location: { start: { line: number; column: number }; end: { line: number; column: number } }
    ruleId?: string
  }>
  summary: string
}
```

### 2.4 File Access API

#### FR-010: File Reading
The plugin SHALL be able to read files from the workspace via:
- The `client` object from `PluginInput`
- Using Node.js `fs` module for direct file access
- Supporting both absolute and relative paths

#### FR-011: File Path Resolution
The plugin SHALL resolve relative file paths relative to:
- The `directory` field from `PluginInput` (workspace root)
- The current working directory context

### 2.5 Installation and Distribution

#### FR-012: Package Format
The plugin SHALL be distributed as a `.zip` archive containing:
- All bundled JavaScript files
- The `plugin.json` manifest
- Any required static assets

#### FR-013: Installation Flow
The plugin SHALL be installable via:
- Manual placement in the plugins directory
- Registration with OpenCode's plugin loader

#### FR-014: Version Compatibility
The plugin SHALL declare compatibility with OpenCode version range:
- Minimum required version in `plugin.json` (`engines.opencode`)
- Semantic version matching (e.g., ">=0.1.0")

---

## 3. Non-Functional Requirements

### 3.1 Performance

#### NFR-001: Startup Time
The plugin SHALL initialize and activate within 2 seconds under normal conditions.

#### NFR-002: Tool Execution Time
The demo tool SHALL complete execution within 5 seconds for files up to 10,000 lines.

#### NFR-003: Memory Usage
The plugin SHALL consume no more than 100MB of additional memory during operation.

### 3.2 Reliability

#### NFR-004: Error Handling
All plugin functions SHALL:
- Catch and handle errors internally
- Return meaningful error messages
- Never throw unhandled exceptions that crash the plugin

#### NFR-005: Graceful Degradation
The plugin SHALL continue to function (even in limited capacity) when:
- File reading fails (report error, don't crash)
- Tool execution fails (return error result, don't crash)

### 3.3 Maintainability

#### NFR-006: TypeScript Usage
The plugin SHALL be written in TypeScript with:
- Strict mode enabled
- No `any` types in public interfaces
- Full type definitions for all exported functions

#### NFR-007: Code Organization
The plugin codebase SHALL follow this structure:
```
src/
├── index.ts          # Main entry, exports Hooks
├── types.ts          # TypeScript interfaces
└── tools/
    └── analyze.ts    # Tool implementations
```

### 3.4 Compatibility

#### NFR-008: Runtime Compatibility
The plugin SHALL run on:
- OpenCode with Bun runtime on Windows
- TypeScript 5.x compatibility

#### NFR-009: API Stability
The plugin SHALL NOT depend on undocumented or internal OpenCode APIs beyond `@opencode-ai/plugin` public interfaces.

---

## 4. Out of Scope

The following features are explicitly OUT OF SCOPE for Phase 1 DEMO:
- AST parsing and code analysis
- Data flow analysis
- Editor integration (diagnostics, go-to-definition)
- File watching
- Plugin configuration UI
- Plugin marketplace

---

## 5. Acceptance Criteria Summary

| ID | Requirement | Acceptance Criteria |
|-----|--------------|---------------------|
| FR-001 | Package Structure | Plugin can be packaged as .zip with manifest + JS |
| FR-002 | Manifest | plugin.json contains all required fields |
| FR-003 | Init Hook | init(config) is callable and receives PluginInput |
| FR-004 | Activate Hook | activate() registers tools successfully |
| FR-005 | Deactivate Hook | deactivate() cleans up properly |
| FR-006 | Health Check | ping() returns status object |
| FR-007 | Tool Definition | Tool definitions follow specified interface |
| FR-009 | Demo Tool | analyze-file tool executes and returns results |
| FR-010 | File Reading | Plugin can read files from workspace |
| FR-013 | Installation | Plugin can be loaded by OpenCode |
| NFR-004 | Error Handling | No unhandled exceptions |