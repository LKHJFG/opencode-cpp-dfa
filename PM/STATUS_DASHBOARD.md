# 项目状态仪表盘

> 更新日期: 2026-05-14 | 项目: `opencode-cpp-dfa` | 版本 v0.5.0 | GitHub: [LKHJFG/opencode-cpp-dfa](https://github.com/LKHJFG/opencode-cpp-dfa)

---

## 健康检查

| 指标 | 值 | 状态 |
|------|----|------|
| **版本** | v0.5.0 | 🟢 |
| **测试** | 196 pass, **0 fail**, 612 expect, 10 files | 🟢 |
| **构建** | `bun run tsc --noEmit` ✅ / `bun build` ✅ | 🟢 |
| **WASM** | wasmAvailable=true, resolveWasmPaths() ✅ | 🟢 |
| **注册工具** | 8 个（含 trace_variable） | 🟢 |
| **Git** | ✅ **已初始化** — 12 commits on `master` | 🟢 |
| **远程仓库** | ✅ **已推送** — `github.com/LKHJFG/opencode-cpp-dfa` | 🟢 |
| **CI/CD** | ✅ **已触发** — `.github/workflows/ci.yml` 在 push 时自动运行 | 🟢 |
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
| **v1 行扫描** | `cpp-analysis.test.ts` | 47 | 兜底层（+17 R5 增强） |
| **插件** | `plugin.test.ts` | 8 | 工具注册 |
| **其他** | 4 文件 | 23 | 边缘案例等 |
| **合计** | **10 files** | **196** | **0 fail** |

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
| `src/tools/cpp/cpp-cfg.ts` | ~380 | v1 行扫描 CFG | 2026-05-14 |
| `src/tools/cpp/cfg-types.ts` | ~55 | CFG 共享类型定义 | 2026-05-14 |
| `src/tools/cpp/cpp-dataflow.ts` | ~527 | DFA 引擎（通用） | 2026-05-11 |
| `src/tools/cpp/cpp-parser.ts` | ~150 | WASM 包装器 | 2026-05-11 |

---

## 当前冲刺进度 (v0.5.0 Sprint)

| WP | 任务 | 状态 | 版本 |
|----|------|------|------|
| P8-A | 跨文件前向链去重 (R8) + 循环保护 | ✅ **完成** | v0.5.0 |
| P8-B | 指针链 value→ptr→pptr (pointer_assign 边) | ✅ **完成** | v0.5.0 |
| P8-C | 强化 SectionB/G/H 测试断言 | ✅ **完成** | v0.5.0 |
| P8-D | CFG 类型抽取 + 重构 (`cfg-types.ts`) | ✅ **完成** | v0.5.0 |
| P8-E | WASM 鲁棒性 + 引擎可观测性 + AST 复用 | ✅ **完成** | v0.5.0 |
| P8-F | 复杂表达式解析增强 (R5) | ✅ **完成** | v0.5.0 |
| P8-G | Git 初始化 + CI/CD 文件就绪 | ✅ **完成** | v0.5.0 |

---

## 已知风险

| 风险 | 等级 | 影响 | 缓解 |
|------|------|------|------|
| R4 WASM 测试环境路径解析 | 🟡 中 | 测试环境 WASM 初始化可能失败 | ✅ v0.5.0 增强：`static-analysis-plugin/node_modules/` fallback + debug 日志 |
| R5 复杂表达式解析遗留 (v1 正则) | 🟢 低 | `&arr[idx]`, `**ptr`, 嵌套模板等不支持 | ✅ v0.5.0 已增强；遗留项列为 P3 |
| R6 无 CI/CD 流程 (网络不通) | 🟡 中 | 无法自动化测试/部署 | ⬜ `.github/workflows/` 已就绪，待网络通时推送 |
| R7 Team mode EPERM (Windows) | 🟡 中 | 团队协作启动失败 | ✅ 已知：改用 `subagent_type=general` 绕过 |
