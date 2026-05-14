/**
 * main.cpp — Complex cross-file data flow testbed.
 *
 * Each section demonstrates a different data flow pattern:
 *   Section A: Simple cross-file function call chain
 *   Section B: Reference/pointer parameter (in/out)
 *   Section C: Struct data flow across files
 *   Section D: Alias chains (pointer aliasing)
 *   Section E: Nested function calls
 *   Section F: Array/buffer pointer flow
 *   Section G: Double indirection
 *   Section H: Mixed pipeline (all patterns combined)
 */

#include "types.h"
#include "math_utils.h"
#include "io_ops.h"
#include "alias_playground.h"
#include "pipeline.h"

// ============================================================
// Section A: Simple cross-file function call chain
// ============================================================
void sectionA() {
    int input = 42;

    // Direct cross-file calls: main.cpp → math_utils.cpp
    int step1 = add(input, 10);          // input → a(param), return → step1
    int step2 = multiply(step1, 2);      // step1 → a(param), return → step2
    int step3 = computeValue(step2, 5);  // step2 → x(param), 5 → y(param), return → step3

    // Pure function chain within one expression
    int chained = square(cube(input));   // input → cube → square → chained

    // clamp forward flow
    int clamped = clamp(step3, 0, 100);
}

// ============================================================
// Section B: Reference/pointer parameter (in/out)
// ============================================================
void sectionB() {
    int val = 5;

    // Reference: val → r(ref) → modified in io_ops.cpp, flows back to val
    transformRef(val);
    incrementRef(val);
    doubleRef(val);

    // Pointer: val → p(ptr) → dereferenced in io_ops.cpp, modifies val
    modifyViaPointer(&val);

    // Swap: two variables exchanged via pointers
    int a = 10;
    int b = 20;
    swap(&a, &b);  // a gets 20, b gets 10
    // Forward: a → swap temp, b → *a
    // Forward: b → *b, a → temp

    int val2 = 100;
    doubleRef(val2);
    doubleRef(val2);
    // val2: 100 → 200 → 400
}

// ============================================================
// Section C: Struct data flow across files
// ============================================================
void sectionC() {
    // Create Data via factory function
    Data d1 = createData(7, 3);    // val=7, mul=3 → returned as d1

    // Pass entire struct BY VALUE to pipeline.cpp
    Result res1 = processData(d1);  // d1 → d(param, copy), return → res1

    // Pass struct BY POINTER to pipeline.cpp
    modifyData(&d1);                // &d1 → pd(ptr), modifies d1

    // Pass struct BY CONST REFERENCE to pipeline.cpp
    int val = extractValue(d1);     // d1 → rd(const ref), return → val

    // Chained computation via computeResult
    Data d2 = createData(10, 5);
    Result res2 = computeResult(d2);  // d2 → input → extractValue → v → computeResult
}

// ============================================================
// Section D: Alias chains (pointer aliasing)
// ============================================================
void sectionD() {
    int target = 999;

    // Direct alias: alias → target
    int* alias1 = &target;
    *alias1 = 100;  // target is now 100 (write through alias)

    // Alias chain: alias2 → alias1 → target
    int* alias2 = alias1;
    *alias2 = 200;  // target is now 200

    // createAlias: alias3 → target (set through function)
    int* alias3 = nullptr;
    createAlias(alias3, &target);  // alias3 = &target
    writeViaAlias(alias3, 300);    // target = 300

    // aliasChain: alias5 → alias4 → target
    int* alias4 = nullptr;
    int* alias5 = nullptr;
    aliasChain(alias5, alias4, &target);  // alias4 = &target, alias5 = alias4
    writeViaAlias(alias5, 400);    // target = 400

    // Read through alias
    int final = readViaAlias(alias3);  // final = 400 (target's value)
}

// ============================================================
// Section E: Nested function calls
// ============================================================
void sectionE() {
    int raw = 5;

    // Nested pure: raw → cube → square → multiply → result
    int result = cube(square(raw));

    // Mixed: raw → add(computeValue(...), ...) → doubleRef via reference
    int v1 = computeValue(raw, 3);
    int v2 = computeValue(raw, 4);
    int combined = add(v1, v2);  // v1 → a(param), v2 → b(param)

    // Reference after compute
    doubleRef(combined);  // combined → r(ref), modified
}

// ============================================================
// Section F: Array/buffer pointer flow
// ============================================================
void sectionF() {
    int buffer[5];

    // Fill buffer via pointer in io_ops.cpp
    fillBuffer(buffer, 5, 42);  // buffer → buf(ptr), 42 → value

    // Accumulate via pointer in math_utils.cpp
    int total = accumulate(buffer, 5);  // buffer → arr(ptr), return → total

    // Index access and pointer arithmetic
    int* ptr = &buffer[2];
    int third = *ptr;  // third = 42 (the value at buffer[2])

    // Struct with buffer pointer
    Data container;
    container.value = 10;
    container.buffer = buffer;
    container.bufferLen = 5;

    // Modify buffer through struct pointer field in pipeline.cpp
    updateBuffer(container, 0, 99);  // buffer[0] = 99

    // Read and scale
    int scaled = readAndScale(&third, 2.5);  // third → p(const ptr), return → scaled
}

// ============================================================
// Section G: Double indirection
// ============================================================
void sectionG() {
    int value = 777;

    int* ptr = &value;
    int** pptr = &ptr;

    // Double dereference in alias_playground.cpp
    int result = doubleDeref(pptr);  // pptr → pp, return → result (= value)
}

// ============================================================
// Section H: Mixed pipeline (all combined)
// ============================================================
void sectionH() {
    int base = 3;

    // Chain through multiple files and patterns
    int a1 = add(base, 1);           // math_utils.cpp (pure)
    int a2 = multiply(a1, 2);        // math_utils.cpp (pure)
    transformRef(a2);                 // io_ops.cpp (in/out ref)

    Data d3 = createData(a2, 10);    // pipeline.cpp → struct in main
    modifyData(&d3);                  // pipeline.cpp (pointer, modifies d3)

    int* alias_ptr = nullptr;
    createAlias(alias_ptr, &d3.value);  // alias_playground.cpp → alias to d3.value
    writeViaAlias(alias_ptr, 999);       // d3.value = 999

    Result finalRes = processData(d3);  // pipeline.cpp → final result

    // Read back through const ref
    int final_val = extractValue(d3);   // pipeline.cpp → final_val = 999

    // Multi-hop chain across 3 files
    int multi = base;
    transformRef(multi);              // io_ops: multi + 1
    int multi2 = computeValue(multi, 10);  // math_utils: (multi+10) + (multi*10)
    modifyViaPointer(&multi2);        // io_ops: multi2 * 2
}

// ============================================================
// main()
// ============================================================
int main() {
    sectionA();
    sectionB();
    sectionC();
    sectionD();
    sectionE();
    sectionF();
    sectionG();
    sectionH();
    return 0;
}
