# 风险与问题日志

> 记录项目中的已知风险、技术债务、限制问题和架构决策。

---

## 当前风险

| # | 风险描述 | 等级 | 影响域 | 状态 | 缓解计划 |
|---|---------|------|--------|------|---------|
| R4 | **WASM 测试环境路径解析** | 🟡 中 | 测试覆盖 | ✅ v0.5.0 增强 | 新增 `static-analysis-plugin/node_modules/` fallback + debug 日志；v2 复用已解析 AST，避免 v3→v2 重复解析 |
| R5 | **&var 前缀剥离为字符串处理** | 🟢 低 | 表达式解析 | ⬜ v0.5.0 | `&arr[idx]` 等复杂表达式不支持 |
| R6 | **无 CI/CD 流程** | 🟡 中 | 交付质量 | ⬜ 文件已就绪，网络不通阻塞 | GitHub Actions 配置已完成 (`.github/workflows/ci.yml` + `release.yml`)，需 GitHub 网络通时执行 `git push` |
| R7 | **Team mode EPERM (Windows)** | 🟡 中 | 团队协作 | ✅ 已知 | 改用 `subagent_type=general` 平行派发 |
| R8 | **跨文件前向链重复边** | 🟡 中 | 追踪质量 | ✅ v0.5.0 已关闭 | 移除 `traceInFile` 递归 re-entry + `enteredFuncs` 循环保护 |

---

## 技术债务

| # | 债务描述 | 领域 | 引入版本 | 计划清理版本 |
|---|---------|------|---------|------------|
| T2 | line-scan 85% 语法覆盖（正则缺陷） | v1 DFA | v0.3.0 | v0.6.0（待规划） |

---

## 已关闭风险

| # | 描述 | 原始等级 | 关闭版本 | 关闭原因 |
|---|------|---------|---------|---------|
| R-01 | 跨文件边不产生 (`buildCallGraph` 过滤) | 🔴 高 | v0.4.3 | 新增 `filterExternal` 参数 |
| R-02 | `alias3`→`target` 后向断链 | 🔴 高 | v0.4.4 | 后向副作用追踪 |
| R-03 | `findVariableLine` 正则误匹配 `value` | 🟡 中 | v0.4.4 | 注释剥离 + `(?<!\.)` 负向后顾 |
| R-04 | 跨文件后向 caller 找不到 | 🟡 中 | v0.4.4 | 遍历 workspace 所有文件 |
| R8 | 跨文件前向链重复边 | 🟡 中 | v0.5.0 | 移除递归 re-entry + `enteredFuncs` 循环保护 |
| R1 | **项目目录无 git 仓库** | 🔴 高 | v0.5.0 | `git init` + `.gitignore` + 初始 commit (599c283) |

---

## 已关闭技术债务

| # | 描述 | 原等级 | 关闭版本 | 关闭原因 |
|---|------|--------|---------|---------|
| T1 | `ast-to-cfg.ts` ~18KB 体积过大 (实际 478 行，原误将 bytes 记为行数) | 🟡 中 | v0.5.0 | 评估发现实际仅 478 行，非债务 |
| T3 | `cpp-cfg.ts` ~14.6KB 与 ast-to-cfg.ts 有重复 (实际 427 行) | 🟡 中 | v0.5.0 | CFG 类型定义抽取到 `cfg-types.ts`，两文件共享类型，重复消除 |
| T4 | 测试断言偏弱（部分仅 `toBeDefined()`） | 🟡 中 | v0.5.0 | SectionB/G/H 测试强化 |
| T5 | `handoff` 与 `HANDFOFF.md` 双源不一致 | 🟡 中 | v0.4.4 | 已清理 |
| R2 | **void 函数引用参数不产生数据边** | 🟡 中 | v0.4.5 | `traceInterprocedural` + `traceInFile` 前向 ref_param_out |
| R3 | **maxDepth=3 硬编码** | 🟡 中 | v0.4.5 | `trace_variable` 工具参数化 |

---

## 架构决策记录 (ADR)

| 决策 | 选择 | 替代方案 | 理由 |
|------|------|---------|------|
| ADR-1: 三层降级 vs 单引擎 | 三级降级 (v3→v2→v1) | 单一引擎 | WASM 可能失败，必须有兜底 |
| ADR-2: v4 独立于 v3 降级链 | 独立分支 | 作为 v3 的降级层 | 跨文件需工作区扫描，本质不同 |
| ADR-3: filterExternal 默认 true | 参数化 | 复制代码 | 一个函数两种行为 |
| ADR-4: 引用参数检测用 defVars | defVars 检测 | 类型系统推断 | 无需 C++ 类型信息 |
