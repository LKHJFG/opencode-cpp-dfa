/* DFA EDGE CASE: move-semantics
 * Tests move constructor and rvalue reference data flow.
 * Current DFA cannot model moved-from state of variables.
 * std::move transfers ownership but doesn't invalidate the source in analysis.
 */

#include <iostream>
#include <vector>
#include <string>
#include <utility>

void target(std::string& s) {
    std::cout << "lvalue: " << s << std::endl;
}

void target(std::string&& s) {
    std::cout << "rvalue: " << s << std::endl;
}

template<typename T>
void forwarder(T&& arg) {
    target(std::forward<T>(arg));
}

class Buffer {
    int* data;
    size_t size;
public:
    Buffer(size_t s) : size(s) {
        data = new int[s];
    }

    Buffer(Buffer&& other) noexcept : data(other.data), size(other.size) {
        other.data = nullptr;
        other.size = 0;
    }

    Buffer& operator=(Buffer&& other) noexcept {
        delete[] data;
        data = other.data;
        size = other.size;
        other.data = nullptr;
        other.size = 0;
        return *this;
    }

    ~Buffer() { delete[] data; }
};

void sink(std::vector<int>&& v) {
    std::cout << "sink received " << v.size() << " elements" << std::endl;
}

int main() {
    std::string a = "hello";
    std::string b = std::move(a);

    std::vector<int> data = {1, 2, 3};
    std::vector<int> also_moved = std::move(data);

    forwarder(std::string("temp"));
    forwarder(b);

    Buffer buf1(100);
    Buffer buf2(std::move(buf1));

    std::vector<int> vec = {1, 2, 3};
    sink(std::move(vec));

    auto ptr = std::make_unique<int>(42);
    auto moved_ptr = std::move(ptr);

    std::cout << "b=" << b << " also_moved size=" << also_moved.size()
              << " moved_ptr=" << *moved_ptr << std::endl;
    return 0;
}