# 项目状态仪表盘

> 更新日期: 2026-05-13 | 项目: `static-analysis-plugin` in `plugin4opencode` | 版本 v0.5.0

---

## 健康检查

| 指标 | 值 | 状态 |
|------|----|------|
| **版本** | v0.5.0 | 🟢 |
| **测试** | 177 pass, **0 fail**, 588 expect, 10 files | 🟢 |
| **构建** | `bun run tsc --noEmit` ✅ / `bun build` ✅ | 🟢 |
| **WASM** | wasmAvailable=true, resolveWasmPaths() ✅ | 🟢 |
| **注册工具** | 8 个（含 trace_variable） | 🟢 |
| **Git** | ❌ **未初始化** — `C:\work\plugin4opencode` 不是 git 仓库 | 🔴 |
| **未解决问题** | 1 个已知限制（P3 x1） | 🟡 |

---

## 测试覆盖矩阵

### 按层级

| 层级 | 文件 | tests | 覆盖率说明 |
|------|------|-------|-----------|
| **v4 跨文件** | `cross-file-dfa.test.ts` | 27 | 跨文件边 `fromFile!==toFile` 断言 |
| **v3/v4 复杂流** | `complex-flow-dfa.test.ts` | 28 | 8 种模式跨文件别名链全部通过 ✅ |
| **v3 跨函数** | `cross-function-dfa.test.ts` | 27 | 单文件内跨函数追踪 |
| **v2 AST** | `ast-dfa-integration.test.ts` | 34 | AST DFA 集成 |
| **v1 行扫描** | `cpp-analysis.test.ts` | 30 | 兜底层 |
| **插件** | `plugin.test.ts` | 8 | 工具注册 |
| **其他** | 4 文件 | 23 | 边缘案例等 |
| **合计** | **10 files** | **177** | **0 fail** |

### 复杂流 8 阶段状态

| Section | 模式 | 前向 | 后向 | 说明 |
|---------|------|------|------|------|
| A | 纯函数调用链 | ✅ | N/A | input→...→clamped, 27 edges |
| B | void 引用参数 | ✅ | ✅ | v4 路径：`cross_file_ref_modify` 边 `r→val`、`p→val`；v3 路径 smoke |
| C | 结构体数据流 | ✅ | ✅ | 跨文件 struct 字段追踪 |
| D | 别名链 | ✅ | ✅ **v0.4.4 修复** | final→createAlias→target |
| E | 嵌套函数调用 | ✅ | ✅ | cube(square(raw)) |
| F | 数组/缓冲区指针 | ✅ | ✅ | buffer→accumulate 等 |
| G | 双重间接引用 | ✅ | ✅ | value→ptr→pptr→result |
| H | 混合管线 | ✅ | ✅ | 3 文件混合管线 |

---

## 核心文件指标

| 文件 | 行数 | 作用 | 最后修改 |
|------|------|------|---------|
| `src/tools/cpp/cross-file-dfa.ts` | ~844 | v4 跨文件引擎 | 2026-05-13 |
| `src/tools/cpp/variable-trace.ts` | ~401 | 主入口，三级 fallback | 2026-05-13 |
| `src/tools/cpp/cross-function-dfa.ts` | ~435 | v3 跨函数引擎 | 2026-05-13 |
| `src/tools/cpp/ast-to-cfg.ts` | ~17,952 | v2 AST→CFG | 2026-05-11 |
| `src/tools/cpp/cpp-cfg.ts` | ~14,620 | v1 行扫描 CFG | 2026-05-11 |
| `src/tools/cpp/cpp-dataflow.ts` | ~527 | DFA 引擎（通用） | 2026-05-11 |
| `src/tools/cpp/cpp-parser.ts` | ~150 | WASM 包装器 | 2026-05-11 |

---

## 当前冲刺进度 (v0.5.0 Sprint)

| WP | 任务 | 状态 | 版本 |
|----|------|------|------|
| P8-A | 跨文件前向链去重 (R8) + 循环保护 | ✅ **完成** | v0.5.0 |
| P8-B | 指针链 value→ptr→pptr (pointer_assign 边) | ✅ **完成** | v0.5.0 |
| P8-C | 强化 SectionB/G/H 测试断言 | ✅ **完成** | v0.5.0 |

---

## 已知风险

| 风险 | 等级 | 影响 | 缓解 |
|------|------|------|------|
| 非 git 仓库 | 🔴 | 无版本历史、无法回退、无法分支管理 | 初始化 git 仓库 |
| WASM 测试环境路径 | 🟡 | 测试中 WASM 初始化失败自动降级 v1 | 生产环境无此问题 |环 |
| 无 CI/CD | 🟡 | 无法自动化测试和部署 | v0.6.0 规划 |
