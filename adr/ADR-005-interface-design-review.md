# ADR-005: 插件接口设计回顾与改进建议

> 日期: 2026-05-13 | 状态: 草稿 | 作者: P9 Tech Lead

---

## 1. 现状：插件给 OpenCode 的接口全景

### 1.1 plugin.json

```json
{
  "name": "static-analysis-plugin",
  "version": "0.4.0",        // ⚠️ 与 package.json 的 0.5.0 不同步
  "description": "Static code analysis plugin for OpenCode",
  "author": "Sisyphus",
  "entry": "./dist/index.js",
  "hooks": ["tool"]           // 仅注册了 tool hooks
}
```

### 1.2 注册的 8 个工具

| # | 工具名 | 类别 | 参数 | 返回值 | 分析引擎 | 数据去向 |
|---|--------|------|------|--------|---------|---------|
| 1 | `analyze_file` | 文件级 | filePath | `{ output, metadata: { lineCount, findingCount, findings[], language } }` | 行扫描正则 | 入参 → 文件 → 分析结果 |
| 2 | `list_source_files` | 项目级 | directory, includeHidden | `{ output, metadata: { files[], totalEntries, totalFiles, totalDirs } }` | 文件系统遍历 | 入参 → 目录 → 文件列表 |
| 3 | `grep_source` | 项目级 | pattern, directory, caseSensitive, fileTypes, maxResults | `{ output, metadata }` | 内容搜索 | 入参 → 项目 → 匹配行 |
| 4 | `code_stats` | 项目级 | directory | `{ output, metadata: { fileCount, dirCount, languages{} } }` | 文件系统统计 | 入参 → 项目 → 语言分布 |
| 5 | `analyze_imports` | 文件级 | filePath, projectRoot | `{ output, metadata: { imports[], exports[], externalDeps[], circular[] } }` | 正则解析 | 入参 → 文件 → 依赖关系 |
| 6 | `find_unused_exports` | 项目级 | directory, excludeDirs, entryFiles | `{ output, metadata: { unused[], totalExports, totalFiles } }` | 跨文件扫描 | 入参 → 项目 → 未使用导出 |
| 7 | `analyze_complexity` | 文件级 | filePath | `{ output, metadata: { functions[], avgComplexity, overallScore } }` | 正则复杂度分析 | 入参 → 文件 → 函数指标 |
| 8 | `trace_variable` | **C++ 专用** | filePath, variableName, line?, direction?, directory?, maxDepth? | `{ output, metadata: { edges[], allVariables[] } }` | **四层 DFA 管线 (v4→v3→v2→v1)** | 入参 → C++ 文件/项目 → 数据流图 |

### 1.3 内部架构

```
                ┌─────────────────┐
                │  plugin.json     │  ← 元数据、声明
                │  src/index.ts    │  ← 8 个 tool() 定义
                └────────┬────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────▼──────┐  ┌───▼────┐  ┌─────▼──────────┐
   │ 通用分析工具  │  │ 搜索工具│  │ C++ DFA 管线   │
   │ analyze_file │  │ grep   │  │ trace_variable │
   │ complexity   │  │ source │  │  ├─ v4 跨文件   │
   │ imports      │  │        │  │  ├─ v3 跨函数   │
   │ unused_expts │  │        │  │  ├─ v2 AST      │
   │ code_stats   │  │        │  │  └─ v1 行扫描   │
   │ list_source  │  │        │  │                │
   └──────────────┘  └────────┘  └────────────────┘
```

### 1.4 数据流模式

当前所有工具遵循相同的数据流模式：

```
OpenCode AI Agent
    │
    │ 1. 根据任务选择工具
    │ 2. 传入参数 (zod validated)
    ▼
tool.execute(args, context)
    │
    │ 3. 调用内部分析引擎
    │ 4. 返回 { output: string, metadata: object }
    ▼
OpenCode AI Agent
    │
    │ 5. 将 output 作为上下文继续推理
    │ 6. 可选的 metadata 用于结构化展示
    ▼
最终响应
```

---

## 2. 官方 OpenCode Plugin API 规范

### 2.1 核心类型

```typescript
// 插件定义
type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>

// Hook 类型
type Hooks = {
    tool?: Record<string, ToolDefinition>  // ← 我们只用了这个
    auth?: AuthHook[]
    // 还有其他 hooks 未使用
}

// 工具定义
function tool<Args>(input: {
    description: string;     // AI 选择的依据
    args: Args;              // zod schema
    execute(args, context): Promise<ToolResult>;
}): ToolDefinition

// 工具结果
type ToolResult = string | {
    output: string;          // 主要返回内容
    metadata?: Record<string, any>;  // 结构化数据
}

// 工具上下文
type ToolContext = {
    sessionID: string;
    directory: string;
    worktree: string;
    abort: AbortSignal;       // 取消信号
    metadata(input): void;    // 进度推送
    ask(input): Effect<void>; // 权限请求
}
```

### 2.2 官方示例

```typescript
const ExamplePlugin = async (_ctx) => {
    return {
        tool: {
            mytool: tool({
                description: "This is a custom tool",
                args: { foo: tool.schema.string().describe("foo") },
                async execute(args) {
                    return `Hello ${args.foo}!`;
                },
            }),
        },
    };
};
```

---

## 3. 问题分析

### 3.1 🟢 做得好的

| 方面 | 评价 |
|------|------|
| API 合规 | 正确使用 `tool()` + `tool.schema` + `Plugin` 类型 |
| 错误处理 | 每个工具独立 try/catch，返回错误信息而非崩溃 |
| 返回值格式 | 统一 `{ output, metadata }`，AI 友好 |
| 路径处理 | 使用 `context.directory` 做路径拼接，遵循官方推荐 |
| 工具粒度 | 单职责，每个工具做一件事 |

### 3.2 🟡 可改进的

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | **plugin.json 版本不同步** | package.json=0.5.0, plugin.json=0.4.0 → 发布后 OpenCode 显示旧版本 | 🔴 高 |
| 2 | **trace_variable 未使用 zod schema** | `createVariableTraceTool(): any` 返回 any 丢失类型安全 | 🔴 高 |
| 3 | **无 context.metadata() 进度反馈** | DFA 复杂分析可能数秒无反馈，用户体验差 | 🟡 中 |
| 4 | **无 abort 信号处理** | 大型项目分析方法未监听 `context.abort` | 🟡 中 |
| 5 | **命令规范不统一** | snake_case 有长有短 (`find_unused_exports` 21 字符) | 🟢 低 |
| 6 | **`ask()` 权限请求未使用** | 某些操作可能需要用户确认（如大项目分析） | 🟢 低 |

### 3.3 🔴 架构层面的问题

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| A | **职责混杂** | 8 个工具中只有 1 个是 C++ 专用，其他 7 个是通用的文件/代码分析工具，与插件名称"static analysis"一致，但 DFA 是真正的差异化能力 | 用户对插件定位困惑 |
| B | **工具间无协作** | 每个工具独立调用。没有"项目健康度"等高阶分析组合多个工具结果 | 限制了 AI Agent 的推理效率 |
| C | **元数据类型不丰富** | metadata 缺少 schema 定义，AI 只能通过 description 了解结构 | 降低工具发现和使用的可靠性 |
| D | **结果体积无控制** | 大型项目分析可能产生大量数据，output 和 metadata 体积不受限 | 可能超出 context 窗口 |
| E | **DFA 管线接口不干净** | `trace_variable` 内部是 v4→v3→v2→v1 四级降级，每级有独立的导入路径和错误处理，回调链复杂 | 维护成本高，测试覆盖难 |

---

## 4. 改进建议

### 4.1 立即改进（P0）

**1. 修复 plugin.json 版本**

```json
{
  "version": "0.5.0"  // 与 package.json 同步
}
```

**2. trace_variable 使用完整 zod schema**

```typescript
// 当前: createVariableTraceTool(): any — 丢失所有类型
// 改进:
import { tool } from "@opencode-ai/plugin"

export const traceVariableTool = tool({
  description: "...",
  args: {
    filePath: tool.schema.string().describe("..."),
    variableName: tool.schema.string().describe("..."),
    direction: tool.schema.enum(["forward", "backward", "both"]).optional().describe("..."),
    directory: tool.schema.string().optional().describe("..."),
    maxDepth: tool.schema.number().optional().describe("..."),
  },
  async execute(args, context) { ... }
})
```

### 4.2 中期改进（P1）

**3. 进度反馈**

```typescript
async execute(args, context) {
  context.metadata({ title: "正在分析项目结构..." })
  // ... 
  context.metadata({ title: "正在执行 DFA 分析 (42%)...", metadata: { progress: 42 } })
}
```

**4. abort 信号处理**

```typescript
async execute(args, context) {
  for (const file of files) {
    if (context.abort.aborted) return { output: "已取消", metadata: { cancelled: true } }
    // ...
  }
}
```

**5. 精细化工具结果 schema — 用 metadata 暴露结构化数据**

定义明确的 metadata TypeScript 类型，让 AI 可以理解返回数据的结构。建议做法是在 description 中描述 metadata 结构，或者使用 JSDoc。

### 4.3 架构层面建议（P2）

**建议 A：功能分组，但保持单一插件（推荐）**

```
tools/
├── generic/                    # 通用文件/代码分析
│   ├── analyze.ts              # analyze_file
│   ├── listing.ts              # list_source_files, code_stats
│   ├── search.ts               # grep_source
│   ├── import-analysis.ts      # analyze_imports
│   ├── unused-exports.ts       # find_unused_exports
│   └── complexity.ts           # analyze_complexity
├── cpp/                        # C++ 专用分析
│   ├── variable-trace.ts       # → `trace_variable` 工具（降低为 v3 入口）
│   ├── workspace-analyzer.ts   # → `analyze_cpp_project` 新工具（统一入口）
│   │   ├── 扫描所有 .cpp/.h
│   │   ├── 构建全局函数注册表
│   │   └── 返回项目级分析摘要
│   ├── cross-file-dfa.ts       # v4（内部引擎）
│   ├── cross-function-dfa.ts   # v3（内部引擎）
│   └── ...                     # v2, v1
└── index.ts                    # 注册所有工具
```

**建议 B：新增一个 `analyze_cpp_project` 组合工具**

将跨文件 DFA 的核心能力封装为一个项目级分析工具：

```typescript
// 新增工具
const analyze_cpp_project = tool({
  description: "Analyze a C++ project for data flow. Builds complete function registry and call graph, "
    + "then runs configurable analyses. Returns project structure overview and variable tracing capabilities. "
    + "Use this FIRST to understand the project, then use trace_variable for specific variable chains.",
  args: {
    directory: tool.schema.string().describe("Project root directory"),
    analyzeAll: tool.schema.boolean().optional().describe("Analyze all variables (slow on large projects)"),
  },
  async execute(args, context) {
    // 1. Scan workspace
    // 2. Build global function registry
    // 3. Return project summary (function count, file count, call graph stats)
    // 4. Cache for use by trace_variable (avoid re-scanning)
  }
})
```

**建议 C：结构化返回元数据**

定义可消费的返回类型（而非仅字符串 output），让 OpenCode 能结构化理解分析结果：

```typescript
// metadata 结构示例 — 提供每个字段的描述
{
  project: {
    totalFiles: number,
    totalFunctions: number,
    callGraphEdges: number
  },
  functions: Array<{
    name: string,
    file: string,
    lines: number,
    params: number,
    complexity: number
  }>,
  dataFlows: Array<{
    from: string,
    to: string,
    type: string,
    file: string,
    line: number
  }>
}
```

### 4.4 长期方向（P3）

**考虑拆分或多插件架构**

随着 DFA 引擎成熟，可以考虑：

```
static-analysis-plugin       ← 通用代码分析（保持通用）
  └─ 7 个通用工具
cxx-dataflow-plugin          ← C++ DFA 专用（独立迭代）
  └─ trace_variable
  └─ analyze_cpp_project
  └─ call_graph
  └─ (未来: control_flow, pointer_analysis, etc.)
```

优势：
- 各插件独立版本迭代
- 用户按需安装
- DFA 插件可以有自己的 `plugin.json` 和生命周期
- C++ 专用工具名不再和通用工具混在一起

劣势：
- 两个 npm 包维护
- 可能有共享代码仍需复用

---

## 5. 与 OpenCode 交互的对比

### 现状流量模式

```
User: "分析这个文件的复杂度"
  └─ AI → analyze_complexity(filePath) → 返回字符串

User: "追踪 val 变量的流向"
  └─ AI → trace_variable(filePath, "val", "forward", directory?)
      └─ 内部: 加载 WASM → 解析 AST → 构建 CFG → 跨函数跨文件追踪
      └─ 返回: edges + variables
```

### 建议优化后的流量模式

```
User: "分析这个 C++ 项目的数据流"
  └─ AI → analyze_cpp_project(directory)
      ├─ 返回: 项目摘要 + 函数注册表 + 代码结构
      └─ 缓存: 工作区分析结果到内存

User: "追踪 val 的流向"
  └─ AI → trace_variable(filePath, "val", "forward")
      └─ 直接使用缓存的 workspace 分析结果（提速 3-10 倍）
      └─ 返回: 结构化边 + 变量链

User: "这个项目的总体质量如何？"
  └─ AI → code_stats + analyze_complexity → 组合 → 综合报告
      └─ 可选项: AI 自行组合多个工具结果
```

关键变化：
1. **`analyze_cpp_project`** 作为 DFA 的慢启动预热，缓存供后续 `trace_variable` 使用
2. AI Agent **组合多个工具结果**进行综合分析
3. 返回值 **结构化 metadata** 让 AI 做进一步推理

---

## 6. 具体行动计划

| 优先级 | 行动 | 负责 | 备注 |
|--------|------|------|------|
| **P0** | 修复 plugin.json 版本同步 | 立即 | 5 分钟 |
| **P0** | trace_variable 改用完整 zod schema | v0.5.1 | 替换 `any` + enum 参数 |
| **P1** | 添加 context.metadata() 进度反馈 | v0.5.1 | DFA 长操作反馈 |
| **P1** | 添加 context.abort 监听 | v0.5.1 | 大项目可取消 |
| **P2** | 新增 `analyze_cpp_project` 工具 | v0.6.0 | 项目级预热入口 |
| **P2** | 缓存工作区分析结果 | v0.6.0 | 避免重复扫描 |
| **P3** | 考虑拆分 C++ DFA 为独立插件 | v0.7.0+ | 独立迭代发布 |

---

## 7. 总结

**当前插件的接口设计基本合理**：8 个工具正确使用了 OpenCode 的 `tool()` API，返回值格式统一，错误处理完整。

**核心问题**是：
1. `trace_variable` 的类型安全性（用 `any` 绕过 zod）— 这是最重要的技术债
2. `plugin.json` 版本不同步 — 最易修复的用户可见问题
3. 缺少对 OpenCode 高级 API（`metadata()`, `abort`, `ask()`）的利用
4. C++ DFA 能力缺乏项目级入口，每次调用都从零扫描

**建议 v0.6.0 优先解决**类型安全和项目级预热入口这两个痛点，让 DFA 引擎的接口更健壮、更高效。
