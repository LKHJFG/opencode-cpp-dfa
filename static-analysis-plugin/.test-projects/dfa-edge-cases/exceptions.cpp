/* DFA EDGE CASE: exceptions
 * Tests exception handling data flow.
 * Current DFA cannot model control flow through try/catch/throw.
 * Exception paths create non-linear control flow that line-scan misses.
 */

#include <iostream>
#include <stdexcept>
#include <string>

int riskyOperation() {
    throw std::runtime_error("error");
    return 0;
}

int main() {
    int result;
    try {
        result = riskyOperation();
    } catch (std::exception& e) {
        int fallback = -1;
        result = fallback;
    }

    try {
        try {
            int inner_result = riskyOperation();
        } catch (...) {
            int recovered = 1;
            throw;
        }
    } catch (...) {
        int outer_catch = 0;
    }

    int status = ([](void) -> int {
        throw 42;
        return 0;
    })();

    try {
        throw 10;
    } catch (int e) {
        int caught_int = e;
    } catch (const char* s) {
        const char* caught_str = s;
    } catch (...) {
        int caught_any = 0;
    }

    std::cout << "result=" << result << " status=" << status << std::endl;
    return 0;
}