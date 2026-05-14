# Development Tasks: OpenCode Plugin Demo Phase

## Task Overview

| Priority | Description |
|----------|-------------|
| P0 | Must have for DEMO - core plugin skeleton, hooks, tools |
| P1 | Nice to have - enhanced error handling, documentation |

---

## Phase 1: Project Setup

### Task-001: Initialize TypeScript Project
**ID**: Task-001  
**Title**: Initialize TypeScript project with Bun  
**Description**: Create package.json, tsconfig.json, and basic project structure using Bun as runtime  
**Acceptance Criteria**:
- package.json created with name "static-analysis-plugin"
- TypeScript 5.x configured with strict mode
- Scripts for build and type-check defined
- Dependencies: typescript, @opencode-ai/plugin (or appropriate types)

**Skill Tags**: backend  
**Dependencies**: None  
**Priority**: P0  
**Effort**: XS  

---

### Task-002: Configure Build System
**ID**: Task-002  
**Title**: Configure esbuild/bun build for plugin bundling  
**Description**: Set up build tooling to bundle TypeScript into single JS file suitable for distribution  
**Acceptance Criteria**:
- Build script produces single `dist/index.js` bundle
- Type declarations generated for development
- Build output compatible with OpenCode plugin loader

**Skill Tags**: backend  
**Dependencies**: Task-001  
**Priority**: P0  
**Effort**: XS  

---

## Phase 2: Plugin Core

### Task-003: Define Plugin Types
**ID**: Task-003  
**Title**: Create TypeScript interfaces for plugin API  
**Description**: Define PluginManifest, PluginInput, ToolDefinition, and Hooks interfaces based on OpenCode plugin patterns  
**Acceptance Criteria**:
- types.ts created with all required interfaces
- Interfaces match OpenCode's @opencode-ai/plugin patterns
- No use of `any` types in public interfaces

**Skill Tags**: plugin-api  
**Dependencies**: None  
**Priority**: P0  
**Effort**: XS  

---

### Task-004: Create Plugin Manifest
**ID**: Task-004  
**Title**: Create plugin.json manifest file  
**Description**: Create the plugin.json with required fields: name, version, description, author, entry, hooks  
**Acceptance Criteria**:
- plugin.json created at project root
- All required fields present and valid
- Hooks array includes "init", "activate", "tool"

**Skill Tags**: backend, docs  
**Dependencies**: Task-001, Task-003  
**Priority**: P0  
**Effort**: XS  

---

### Task-005: Implement Plugin Initialization
**ID**: Task-005  
**Title**: Implement init(config) function  
**Description**: Create the main plugin entry point with init function that receives PluginInput and stores context  
**Acceptance Criteria**:
- index.ts exports init function
- init receives PluginInput with client, project, directory
- Initialization stores context for later use
- Returns promise that resolves when complete

**Skill Tags**: plugin-api  
**Dependencies**: Task-003, Task-004  
**Priority**: P0  
**Effort**: S  

---

### Task-006: Implement Activation Hook
**ID**: Task-006  
**Title**: Implement activate() function  
**Description**: Implement activate function that registers tools with OpenCode's tool registry  
**Acceptance Criteria**:
- activate() callable after init
- Returns promise resolving to tools object
- Tools properly registered with OpenCode

**Skill Tags**: plugin-api  
**Dependencies**: Task-005  
**Priority**: P0  
**Effort**: S  

---

### Task-007: Implement Deactivation Hook
**ID**: Task-007  
**Title**: Implement deactivate() function  
**Description**: Implement deactivate function for cleanup and tool unregistration  
**Acceptance Criteria**:
- deactivate() callable at any time after activation
- Performs cleanup operations
- Returns promise resolving when complete

**Skill Tags**: plugin-api  
**Dependencies**: Task-006  
**Priority**: P0  
**Effort**: XS  

---

### Task-008: Implement Health Check
**ID**: Task-008  
**Title**: Implement ping() health check API  
**Description**: Add ping() method to return plugin operational status  
**Acceptance Criteria**:
- ping() returns { status: "ok" } when healthy
- Returns { status: "error", message: string } when issues exist
- No input parameters required

**Skill Tags**: plugin-api  
**Dependencies**: Task-005  
**Priority**: P0  
**Effort**: XS  

---

## Phase 3: Tool Implementation

### Task-009: Define Tool Interface
**ID**: Task-009  
**Title**: Create ToolDefinition interface and structure  
**Description**: Define tool interface with name, description, inputSchema, and execute function  
**Acceptance Criteria**:
- Tool interface defined in types.ts
- Includes JSON Schema for input validation
- Execute function returns Promise<ToolResult>

**Skill Tags**: plugin-api  
**Dependencies**: Task-003  
**Priority**: P0  
**Effort**: XS  

---

### Task-010: Implement Analyze-File Tool
**ID**: Task-010  
**Title**: Implement analyze-file demo tool  
**Description**: Create the demo tool that reads a file and returns analysis results  
**Acceptance Criteria**:
- Tool named "analyze-file"
- Accepts filePath parameter (required string)
- Reads file content from workspace
- Returns findings array with severity, message, location, ruleId
- Returns summary string

**Skill Tags**: backend, plugin-api  
**Dependencies**: Task-009  
**Priority**: P0  
**Effort**: M  

---

### Task-011: Implement File Reading Utility
**ID**: Task-011  
**Title**: Create file reading utility  
**Description**: Implement utility to read files from workspace using context from PluginInput  
**Acceptance Criteria**:
- Can read files using absolute paths
- Can read files using relative paths (resolved against workspace)
- Handles file not found errors gracefully

**Skill Tags**: backend  
**Dependencies**: Task-005  
**Priority**: P0  
**Effort**: S  

---

## Phase 4: Error Handling

### Task-012: Add Error Handling to Init
**ID**: Task-012  
**Title**: Add robust error handling to init  
**Description**: Wrap init implementation with try-catch to handle errors gracefully  
**Acceptance Criteria**:
- Errors caught and logged
- Returns meaningful error messages
- Never throws unhandled exception

**Skill Tags**: backend  
**Dependencies**: Task-005  
**Priority**: P0  
**Effort**: XS  

---

### Task-013: Add Error Handling to Activate
**ID**: Task-013  
**Title**: Add robust error handling to activate  
**Description**: Wrap activate implementation with try-catch  
**Acceptance Criteria**:
- Errors caught and logged
- Returns meaningful error messages
- Plugin state remains consistent on failure

**Skill Tags**: backend  
**Dependencies**: Task-006  
**Priority**: P0  
**Effort**: XS  

---

### Task-014: Add Error Handling to Tool Execution
**ID**: Task-014  
**Title**: Add error handling to tool execution  
**Description**: Wrap tool execute function with try-catch  
**Acceptance Criteria**:
- File read failures return error result (not crash)
- Validation errors return meaningful message
- Unexpected errors handled gracefully

**Skill Tags**: backend  
**Dependencies**: Task-010  
**Priority**: P0  
**Effort**: XS  

---

## Phase 5: Testing

### Task-015: Create Unit Tests for Plugin Lifecycle
**ID**: Task-015  
**Title**: Write unit tests for init/activate/deactivate  
**Description**: Create vitest tests for plugin lifecycle functions  
**Acceptance Criteria**:
- Test init with valid config
- Test init with invalid config
- Test activate and deactivate flow
- All tests pass

**Skill Tags**: test  
**Dependencies**: Task-005, Task-006, Task-007  
**Priority**: P0  
**Effort**: S  

---

### Task-016: Create Unit Tests for Tool
**ID**: Task-016  
**Title**: Write unit tests for analyze-file tool  
**Description**: Create tests for tool execution with various inputs  
**Acceptance Criteria**:
- Test with valid file path
- Test with non-existent file
- Test returns correct result structure
- All tests pass

**Skill Tags**: test  
**Dependencies**: Task-010  
**Priority**: P0  
**Effort**: S  

---

## Phase 6: Documentation

### Task-017: Write README for Plugin
**ID**: Task-017  
**Title**: Create plugin README documentation  
**Description**: Write README with installation instructions, usage examples, and API documentation  
**Acceptance Criteria**:
- Installation steps clearly documented
- Usage examples for the analyze-file tool
- API reference for init/activate/deactivate/ping

**Skill Tags**: docs  
**Dependencies**: Task-010  
**Priority**: P1  
**Effort**: XS  

---

### Task-018: Document Tool Schema
**ID**: Task-018  
**Title**: Document tool input/output schema  
**Description**: Create API documentation for analyze-file tool parameters and output format  
**Acceptance Criteria**:
- Input parameters documented with types
- Output structure documented
- Example inputs and outputs provided

**Skill Tags**: docs  
**Dependencies**: Task-009  
**Priority**: P1  
**Effort**: XS  

---

## Phase 7: Build & Package

### Task-019: Build Production Bundle
**ID**: Task-019  
**Title**: Build production bundle for distribution  
**Description**: Run build to create production-ready bundle  
**Acceptance Criteria**:
- Bundle created in dist/ folder
- Bundle size reasonable (<1MB)
- Bundle loads correctly

**Skill Tags**: backend  
**Dependencies**: Task-002, Task-010  
**Priority**: P0  
**Effort**: XS  

---

### Task-020: Create Distribution Package
**ID**: Task-020  
**Title**: Create .zip package for distribution  
**Description**: Package the plugin for distribution  
**Acceptance Criteria**:
- .zip file created containing plugin.json and bundle
- Package can be extracted and loaded
- Manifest and code both included

**Skill Tags**: backend  
**Dependencies**: Task-019, Task-004  
**Priority**: P0  
**Effort**: XS  

---

## Task Dependencies Summary

```
Phase 1: Project Setup
├── Task-001: Initialize TypeScript Project
└── Task-002: Configure Build System

Phase 2: Plugin Core (after Phase 1)
├── Task-003: Define Plugin Types
├── Task-004: Create Plugin Manifest (→ Task-001, Task-003)
├── Task-005: Implement init() (→ Task-003, Task-004)
├── Task-006: Implement activate() (→ Task-005)
├── Task-007: Implement deactivate() (→ Task-006)
└── Task-008: Implement ping() (→ Task-005)

Phase 3: Tool Implementation (after Phase 2)
├── Task-009: Define Tool Interface (→ Task-003)
├── Task-010: Implement analyze-file tool (→ Task-009)
└── Task-011: Implement File Reading Utility (→ Task-005)

Phase 4: Error Handling (parallel with Phase 3)
├── Task-012: Error handling init (→ Task-005)
├── Task-013: Error handling activate (→ Task-006)
└── Task-014: Error handling tool (→ Task-010)

Phase 5: Testing (after core implementation)
├── Task-015: Lifecycle tests (→ Task-005, Task-006, Task-007)
└── Task-016: Tool tests (→ Task-010)

Phase 6: Documentation (after implementation)
├── Task-017: README (→ Task-010)
└── Task-018: Tool schema docs (→ Task-009)

Phase 7: Build & Package (after all implementation)
├── Task-019: Build bundle (→ Task-002, Task-010)
└── Task-020: Create zip (→ Task-019, Task-004)
```

---

## Effort Summary

| Effort Level | Count | Total Hours |
|--------------|-------|--------------|
| XS (~30min) | 10 | 5h |
| S (~2h) | 6 | 12h |
| M (~4h) | 1 | 4h |
| L (~1d) | 0 | 0 |
| **Total** | **17** | **~21h** |

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 15 | Must have for demo |
| P1 | 2 | Nice to have |
| **Total** | **17** | |