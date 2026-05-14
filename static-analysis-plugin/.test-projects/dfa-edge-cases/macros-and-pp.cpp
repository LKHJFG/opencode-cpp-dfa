/* DFA EDGE CASE: macros-and-pp
 * Tests preprocessor variable flow.
 * Current line-scan DFA cannot expand macros.
 * Macros create hidden data flow paths that a line-by-line analyzer cannot trace.
 */

#include <iostream>

#define FACTOR 42
#define MAX(a,b) (((a)>(b))?(a):(b))
#define SWAP(t,a,b) { t _tmp = a; a = b; b = _tmp; }

int main() {
    int input = 10;
    int result = FACTOR * input;

    int x = 5, y = 8;
    int m = MAX(x, y);

    int a = 1, b = 2;
    SWAP(int, a, b);

#ifdef OPTIMIZE
    int optimized = 1;
#else
    int optimized = 0;
#endif

#undef FACTOR
#ifndef FACTOR
    int after_undef = 0;
#endif

    std::cout << "result=" << result << " m=" << m << " swapped a=" << a << " b=" << b
              << " optimized=" << optimized << std::endl;

    return 0;
}