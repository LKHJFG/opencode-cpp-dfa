/* DFA EDGE CASE: lambda-closure
 * Tests lambda capture and closure data flow.
 * Current DFA cannot track captured variables across lambda boundaries.
 * Captures create hidden data flow through closure environment.
 */

#include <iostream>
#include <functional>
#include <utility>
#include <memory>

int main() {
    int x = 42;

    auto byValue = [=] { return x; };
    int captured_by_value = byValue();

    auto byRef = [&] { x = 99; };
    byRef();

    auto mut = [=]() mutable {
        x++;
        return x;
    };
    int mutated = mut();

    auto outer = [=]() {
        auto inner = [=]() { return x; };
        return inner();
    };
    int nested_result = outer();

    struct Unique {
        int val;
        Unique(int v) : val(v) {}
    };
    auto mover = [u = std::move(std::unique_ptr<int>(new int(5)))] {};
    auto move_capture = [val = std::move(x)] { return val; };
    int moved = move_capture();

    std::function<int()> stored = [x]() { return x + 1; };
    int stored_result = stored();

    int sum = [&] {
        int total = 0;
        auto add = [&](int v) { total += v; };
        add(1); add(2); add(3);
        return total;
    }();

    std::cout << "captured=" << captured_by_value << " mutated=" << mutated
              << " nested=" << nested_result << " moved=" << moved
              << " stored=" << stored_result << " sum=" << sum << std::endl;
    return 0;
}