/**
 * Test helpers for C++ analysis modules.
 */

/**
 * Returns a standard C++ test program with various constructs for testing.
 */
export function getTestCppCode(): string {
  return [
    "#include <iostream>",
    "#include <vector>",
    "",
    "struct Point {",
    "  int x;",
    "  int y;",
    "};",
    "",
    "int add(int a, int b) {",
    "  return a + b;",
    "}",
    "",
    "int main() {",
    '  std::cout << "Hello, World!" << std::endl;',
    "",
    "  // Basic variable declarations and assignments",
    "  int a = 10;",
    "  int b = a + 5;",
    "  int c = b * 2;",
    "  int d = c - 3;",
    "",
    "  // Pointer operations",
    "  int x = 42;",
    "  int* p = &x;",
    "  int y = *p;",
    "",
    "  // Function calls",
    "  int result = add(a, b);",
    "",
    "  // Struct operations",
    "  Point pt;",
    "  pt.x = 10;",
    "  pt.y = 20;",
    "  int val = pt.x;",
    "",
    "  return c;",
    "}",
  ].join("\n")
}

/**
 * Returns a simple assignment chain test program.
 */
export function getSimpleChainCode(): string {
  return [
    "int main() {",
    "  int a = 10;",
    "  int b = a + 5;",
    "  int c = b * 2;",
    "  return c;",
    "}",
  ].join("\n")
}

/**
 * Returns a pointer test program.
 */
export function getPointerTestCode(): string {
  return [
    "int main() {",
    "  int x = 42;",
    "  int* p = &x;",
    "  int y = *p;",
    "  int** pp = &p;",
    "  int z = **pp;",
    "  return z;",
    "}",
  ].join("\n")
}

/**
 * Returns a test program with control flow.
 */
export function getControlFlowCode(): string {
  return [
    "int main() {",
    "  int x = 10;",
    "  int y = 0;",
    "  if (x > 5) {",
    "    y = x * 2;",
    "  } else {",
    "    y = x / 2;",
    "  }",
    "  int z = y + 1;",
    "  return z;",
    "}",
  ].join("\n")
}

/**
 * Split code into source lines array.
 */
export function createMockSourceLines(code: string): string[] {
  return code.split("\n")
}

/**
 * Create a delay for async parser initialization.
 */
export async function waitForParser(parser: { init(): Promise<void> }): Promise<void> {
  await parser.init()
}
