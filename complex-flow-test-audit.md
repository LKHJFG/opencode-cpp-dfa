# Complex-Flow DFA 测试审计报告
日期: 2026-05-12

## 核心结论

**28 tests 全部通过，但没有一个测试真正验证了跨文件追踪或别名追踪。**

## 审计方法

对每个测试用例，实际调用 `trace_variable` 工具并捕获返回的 `metadata`：
- `allVariables`: 追踪到的所有变量名
- `edges`: 数据流边（每条边有 `fromFile` / `toFile` 字段）
- `edgeTypes`: 边的类型

## 致命发现

### 1. 零跨文件边（Zero Cross-File Edges）

v4（带 `directory` 参数）的所有返回边中，**每一条的 `fromFile` 和 `toFile` 都是 `main.cpp`**。

| 变量 | 方向 | 边数(v3) | 边数(v4) | 跨文件边 | 
|------|------|-----------|-----------|---------|
| input | forward | 5 | 10 | 0 |
| d1 | forward | 2 | 4 | 0 |
| base | forward | 7 | 14 | 0 |
| target | forward | 2 | 4 | 0 |
| total | backward | 2 | 4 | 0 |
| multi2 | backward | 3 | 6 | 0 |

v4 比 v3 多出约一倍的边（疑似参数/返回边的展开），但**没有任何一条边跨越文件边界**。跨文件引擎实际没有工作。

### 2. 别名追踪只发生在 main.cpp 内部

SectionD 的别名链：
```cpp
// main.cpp sectionD
int target = 1000;
int* alias1 = &target;    // ← 在 main.cpp 内
int* alias2 = alias1;      // ← 在 main.cpp 内
int* alias3 = nullptr;     // ← 在 main.cpp 内
writeViaAlias(alias3, 42); // ← 调用 alias_playground.cpp
readViaAlias(alias3);      // ← 调用 alias_playground.cpp
int final = readViaAlias(alias3);
```

v3 追踪 `target→alias1→alias2`（2 条边，`edgeType: "pointer"`）— 但这只追踪了 **main.cpp 内部的指针赋值**。引擎从未进入 `alias_playground.cpp` 去追踪 `writeViaAlias` 或 `readViaAlias` 内部发生了什么。

同样的，调用 `aliasChain(alias2, alias1, target)` 等跨文件别名函数，引擎不会追踪它们的内部数据流。

### 3. 测试断言极弱

**v3 group (18 tests)**：

| 断言模式 | 出现次数 | 实际验证了什么 |
|-----------|---------|--------------|
| `expect(result).toBeDefined()` | 18/18 | 工具没抛异常 |
| `expect(meta).toBeDefined()` | 18/18 | metadata 不为空 |
| `expect(meta.edges.length).toBeGreaterThanOrEqual(1)` | 11/18 | 至少有 1 条边 |
| `expect(meta.allVariables).toContain(startVar)` | 8/18 | 起始变量名出现在 allVariables 中 |
| `expect(Array.isArray(meta.allVariables))` | 2/18 | 仅仅是数组（值可能为空） |

**没有任何测试检查**：
- 边是否跨文件 (`fromFile != toFile`)
- 边是否跨函数 (`fromVar` 和 `toVar` 在不同函数中)
- 别名链是否穿透到被调用函数内部
- 具体的变量链长度或具体的变量名称集合

**v4 group (10 tests)**：

所有 10 个 v4 测试只有：
```typescript
expect(result).toBeDefined()
expect(meta).toBeDefined()
```
**仅此而已**。没有检查 edges，没有检查 allVariables，没有检查有任何数据流被追踪到。

### 4. 引擎能力空白

#### 跨文件分析（v4）实际不可用
带 `directory` 参数时，引擎调用 `analyzeWorkspace()` 和 `traceCrossFile()`，但：
- 所有返回边仍在 `main.cpp` 内
- 没有边显示 `fromFile: math_utils.cpp`、`io_ops.cpp`、`alias_playground.cpp` 等
- 变量 `input` 追踪到 `step1`、`step2` 等，但它们都通过 `add()`, `multiply()`, `computeValue()` 调用 `math_utils.cpp` 的函数——引擎不追踪这些调用内部

#### void 函数引用传参不产生数据流
类似 `transformRef(val)` 这种通过引用修改参数的调用，引擎不产生任何边（0 edges）。因为 v1 line-scan 引擎只追踪 LHS = RHS 的赋值模式，不理解引用/指针的外部写入。

#### 别名同理
`int* alias1 = &target` 这种**本地指针赋值**可以追踪，但调用外部函数 `writeViaAlias(alias3, 42)` 不会产生从 `alias3` 进入函数内部的边。

## 逐个测试详解

### v3: SectionA — input forward ✅ (真实有效)
- 追踪到 input→step1→step2→step3→clamped（5条边）
- edgeType=parameter，fromFile=toFile=main.cpp
- **实际上是在 main.cpp 内部追踪跨函数调用**：input 在 sectionA 内通过 add/multiply/computeValue 链传递
- ✅ 这个测试是有意义的 — v3（单文件跨函数）确实工作

### v3: SectionA — clamped backward ✅ (真实有效)
- 反向追踪 8 条边，从 clamped→step3→computeValue→...→input
- ✅ 有意义

### v3: SectionB — val forward ⚠️ (表面通过)
- 0 条边，allVariables=["val"]（只有起始变量）
- 原测试断言 `allVariables.toContain("val")` 已改为弱断言
- 引擎不能追踪 void 引用传参

### v3: SectionB — val2 backward ⚠️ (表面通过)
- 0 条边
- val2 是常量赋值后在 doubleRef 中引用修改，引擎无追踪

### v3: SectionC — d1 forward ✅ (真实有效)
- d1→res1→val（2条边）
- 结构体传值是通过的

### v3: SectionC — res1 backward ✅ (真实有效)  
- 反向3条边

### v3: SectionD — target forward ⚠️ (部分有效)
- target→alias1→alias2（2条边，edgeType=pointer）
- **但只追踪了 main.cpp 内的指针赋值**，没有进入 alias_playground.cpp
- 别名函数 writeViaAlias/aliasChain/readViaAlias 没有被追踪

### v3: SectionD — final backward ⚠️ (部分有效)
- final→readViaAlias→alias3
- 只追踪到调用点，没进入函数内部

### v3: SectionE — raw forward ✅ (真实有效)
- raw→result→v1→v2→combined（4条边）

### v3: SectionE — combined backward ✅ (真实有效)

### v3: SectionF — buffer forward ✅ (真实有效)
- buffer→total→ptr→container→third→scaled（5条边，多类型）

### v3: SectionF — total backward ✅ (真实有效)

### v3: SectionG — value forward ⚠️ (表面通过)
- 0 条边（指针链 `int* ptr = &value` 引擎无法追踪）

### v3: SectionG — result backward ✅ (真实有效)
- 反向3条边（但这是从 result→cube→square→raw，不是从 result→pptr→ptr→value）

### v3/v4: SectionH — 各种 ⚠️
- 边很多（7-14条），但**全部在 main.cpp 内**
- 声称的"3文件混合管线"没有实际跨文件

### v4: 全部10个测试 ❌ (虚假通过)
- 只有 `toBeDefined()` 断言
- **没有任何测试验证了跨文件数据流**

## 给你的答案

> "跨文件和别名不是还没做吗？为啥测试全通过了？"

**你说得对。跨文件没有做，别名没有做。测试通过了因为测试断言极其薄弱，从未验证过跨文件边界或别名穿透。**

- 28 个测试中约 **15 个是真实有效的**（v3 跨函数追踪在单文件内工作）
- **13 个是表面通过的**（断言太弱或引擎根本不能处理该模式）
- **0 个测试验证了跨文件边界**
- **0 个测试验证了别名穿透到被调用函数**
- **v4 跨文件引擎虽然被调用但产生的结果与 v3 无本质区别**（所有边仍在主文件中）

要真的测试跨文件追踪，需要验证类似 `fromFile=main.cpp` → `toFile=math_utils.cpp` 这样的边。目前没有这样的边存在。
