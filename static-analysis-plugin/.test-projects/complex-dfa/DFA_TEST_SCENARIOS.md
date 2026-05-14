# DFA Test Scenarios for Complex C++ Analysis

This document describes 10+ data flow analysis test scenarios designed to stress-test the line-scan DFA engine.

| # | Scenario Name | File | Data Flow Description | Start Variable | Trace Direction | Expected Edges | Status |
|---|---------------|------|----------------------|----------------|-----------------|----------------|--------|
| 1 | Triple Pointer Chain | `pointers-chain.cpp` | x=10 → p=&x → pp=&p → ppp=&pp, then deref chain: \*p→val1, \*\*pp→val2, \*\*\*ppp→val3 | `x` | forward | x→p→pp→ppp, val1→x, val2→pp→p→x, val3→ppp→pp→p→x | ⚠️ LIMITATION |
| 2 | Pointer Arithmetic | `pointers-chain.cpp` | arr[5]={10,20,30,40,50} → ptr=arr → \*(ptr+2)→offset_val, ptr[1]→base_val | `arr` | forward | arr→ptr→offset_val, arr→ptr→base_val | ⚠️ LIMITATION |
| 3 | Pointer Reference Parameter | `pointers-chain.cpp` | reset(int*& p): p=&internal → ref_ptr→target_ptr → *ref_ptr→after_reset | `target_ptr` | both | target_ptr→ref_ptr→p→internal, internal→*p→after_reset | ⚠️ LIMITATION |
| 4 | Function Chain Value | `function-flow.cpp` | x→step1→s1→step2→s2→step3→s3→step4→s4→step5→s5 | `x` | forward | x→s1→s2→s3→s4→s5 | ✅ |
| 5 | Chained Function Call | `function-flow.cpp` | step5(step4(step3(step2(step1(x)))))→chained | `x` | forward | x→step1→step2→step3→step4→step5→chained | ✅ |
| 6 | Out Parameters | `function-flow.cpp` | split(num,&half1,&half2): *out1=input/2, *out2=input-(input/2) | `num` | forward | num→half1, num→half2 | ✅ |
| 7 | Ref/Ptr Parameter Side Effects | `function-flow.cpp` | compute(a,b,c,d): c modified by reference, *b dereferenced | `ref_val` | forward | ref_val→c→res.value→ref_val_modified | ✅ |
| 8 | Struct Return by Value | `function-flow.cpp` | createData()→data, process(data) modifies, extractId(data)→data_id | `data` | both | createData→data→process→data_id | ⚠️ LIMITATION |
| 9 | Nested Struct Chained Field | `struct-nesting.cpp` | proj.modules[0].files[2].loc = 150 → file_loc = core->files[0].loc | `proj` | forward | proj→core→file_loc, proj.modules→files→loc | ⚠️ LIMITATION |
| 10 | Struct Array Iteration | `struct-nesting.cpp` | totalLinesOfCode: for each module→for each file, total += files[j].loc | `proj` | forward | proj→total | ⚠️ LIMITATION |
| 11 | Deep Nested If-Else | `control-flow-maze.cpp` | classify: 4-level nested if comparing value vs threshold multiples | `value` | forward | value→result at multiple nesting depths | ⚠️ LIMITATION |
| 12 | Loop-Carried Dependency | `control-flow-maze.cpp` | process_conditions: for(i)→while(inner)→for(j), inner-- carries across loops | `a` | forward | a→i→inner→j→result | ⚠️ LIMITATION |
| 13 | Switch Fall-Through | `control-flow-maze.cpp` | evaluate_switch: case 4 falls through to case 5,6 before break | `code` | forward | code→result across fall-through path | ⚠️ LIMITATION |
| 14 | Ternary Chain | `control-flow-maze.cpp` | ternary_chain: r1=a?(b?c:d):(e?f:g), r2 nested ternaries, r3 based on r1,r2 | `a` | forward | a→r1→r3, b→r1→r2, all→final | ⚠️ LIMITATION |
| 15 | Do-While with Break/Continue | `control-flow-maze.cpp` | do_while_loop: counter++, break/continue affect accumulator flow | `start` | forward | start→counter→accumulator, break/continue alter path | ⚠️ LIMITATION |
| 16 | Template Type Deduction | `templates.cpp` | wrap<int>(42)→i, Pair<int,double>→p1, mixed=i+d (decltype) | `i` | forward | i→wrap→i, i+d→mixed | ⚠️ LIMITATION |
| 17 | Template Specialization | `templates.cpp` | Pair<int,string> specialized: isNumeric() on p3 | `p3` | forward | p3→p3n | ⚠️ LIMITATION |
| 18 | if constexpr Branching | `templates.cpp` | inspect<T>: type-dependent behavior based on std::is_integral/floating_point | `i` | forward | i→inspect output path selection | ⚠️ LIMITATION |
| 19 | unique_ptr Lifetime | `modern-cpp.cpp` | createData()→d→d.id→d.reset() (unique_ptr destruction) | `d` | forward | d→data_id, d→score, d.reset() | ⚠️ LIMITATION |
| 20 | shared_ptr Reference Count | `modern-cpp.cpp` | make_shared→shared→copy, use_count() tracks references | `shared` | both | shared→copy, shared→ref_count | ⚠️ LIMITATION |
| 21 | Lambda Capture Modes | `modern-cpp.cpp` | byVal=[=], byRef=[&], mixed=[&,*y]: captures affect return values | `x` | both | x→val_captured, x→ref_captured | ⚠️ LIMITATION |
| 22 | std::move Semantic | `modern-cpp.cpp` | str="hello"→move(str)→moved_str, str becomes empty | `str` | forward | str→moved_str, str→str_empty | ⚠️ LIMITATION |
| 23 | RAII Move Semantics | `modern-cpp.cpp` | wrapper1→move→wrapper2, resource ownership transfer | `wrapper1` | forward | wrapper1→wrapper2→w2_val | ⚠️ LIMITATION |
| 24 | Array of Pointers | `pointers-chain.cpp` | int* ptrs[3]={&x,arr,&global_val} → shift_left(ptrs,3) modifies array | `ptrs` | forward | ptrs→ptr_val→shifted_val | ⚠️ LIMITATION |

## Known Limitations Summary

### Scenarios Expected to PASS (line-scan DFA handles these):
- Simple value chains (scenarios 4, 5, 6, 7)

### Scenarios Expected to FAIL (line-scan DFA limitations):
- **Pointer chains** (1, 2, 3, 24): Cannot track `&` address-of or multi-level dereference `**`
- **Struct return by value** (8): Function return value semantics not tracked
- **Nested struct field access** (9, 10): Chained member access `.` and `[]` not tracked
- **Complex control flow** (11-15): Multi-level nesting, loop-carried deps, switch fall-through, break/continue
- **Templates** (16-18): Template instantiation, type deduction, constexpr branching
- **Modern C++** (19-23): Smart pointers, lambda captures, move semantics, RAII

## Edge Cases

### Pointer Arithmetic Edge Cases
```cpp
int arr[10];
int* p = arr;
int* q = p + 5;     // pointer arithmetic
int val = *(q - 3); // reverse arithmetic
int idx = q - p;    // pointer difference
```

### Reference Aliasing Edge Cases
```cpp
int a = 1;
int& r = a;
int& s = r;  // reference to reference
int t = s;   // should trace: a→r→s→t
```

### Macro Expansion Edge Cases
```cpp
#define SQUARE(x) ((x) * (x))
int y = SQUARE(z); // macro should expand to ((z) * (z))
```