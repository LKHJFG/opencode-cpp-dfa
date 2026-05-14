/* DFA EDGE CASE: templates-generics
 * Tests template instantiation and type deduction data flow.
 * Current DFA cannot perform template instantiation analysis.
 * Each template instantiation creates new data flow paths at runtime.
 */

#include <iostream>
#include <vector>
#include <string>

template<typename T>
T passThrough(T val) {
    return val;
}

template<typename T>
class Holder {
    T val;
public:
    Holder(T v) : val(v) {}
    T get() { return val; }
    void set(T v) { val = v; }
};

template<>
class Holder<int> {
    int val;
public:
    Holder(int v) : val(v * 2) {}
    int get() { return val; }
};

template<typename T>
T identity(T x) { return x; }

int main() {
    int x = 10;
    int y = passThrough(x);

    Holder<int> h1(5);
    int h1_val = h1.get();

    Holder<std::string> h2("test");
    std::string h2_val = h2.get();

    auto deduced = passThrough(42);
    auto chain = identity(identity(passThrough(x)));

    auto vec = std::vector<int>{1, 2, 3};
    for (auto& v : vec) {
        v = passThrough(v);
    }

    std::cout << "y=" << y << " h1=" << h1_val << " h2=" << h2_val
              << " deduced=" << deduced << " chain=" << chain << std::endl;
    return 0;
}