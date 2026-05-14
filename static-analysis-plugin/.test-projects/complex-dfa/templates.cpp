#include <iostream>
#include <string>
#include <type_traits>

template<typename T>
T wrap(T val) {
    return val;
}

template<typename K, typename V>
class Pair {
public:
    K key;
    V value;
    Pair(K k, V v) : key(k), value(v) {}
    K getKey() const { return key; }
    V getValue() const { return value; }
};

template<>
class Pair<int, std::string> {
public:
    int key;
    std::string value;
    Pair(int k, const std::string& v) : key(k), value(v) {}
    int getKey() const { return key; }
    std::string getValue() const { return value; }
    bool isNumeric() const { return !value.empty() && value.find_first_not_of("0123456789") == std::string::npos; }
};

template<typename T>
auto identity(T val) -> decltype(val) {
    return val;
}

template<typename T>
void inspect(T val) {
    if constexpr (std::is_integral<T>::value) {
        std::cout << "integral: " << val << "\n";
    } else if constexpr (std::is_floating_point<T>::value) {
        std::cout << "floating: " << val << "\n";
    } else {
        std::cout << "other: " << val << "\n";
    }
}

template<typename T>
struct Box {
    T value;
    Box(T v) : value(v) {}
    T get() const { return value; }
    void set(T v) { value = v; }
};

template<typename T1, typename T2>
Pair<T1, T2> make_pair(T1 a, T2 b) {
    return Pair<T1, T2>(a, b);
}

int main() {
    int i = wrap(42);
    double d = wrap(3.14);
    std::string s = wrap(std::string("hello"));

    Pair<int, double> p1(1, 2.5);
    Pair<std::string, int> p2("answer", 42);
    Pair<int, std::string> p3(100, "test");

    int p1k = p1.getKey();
    double p1v = p1.getValue();
    std::string p2k = p2.getKey();
    bool p3n = p3.isNumeric();

    auto id_val = identity(99);
    decltype(i + d) mixed = i + d;

    Box<int> ibox(10);
    Box<std::string> sbox("template");
    int box_val = ibox.get();
    ibox.set(20);

    auto pair1 = make_pair(1, 2.5);
    auto pair2 = make_pair("key", 50);

    inspect(i);
    inspect(d);
    inspect(s);

    return p1k + static_cast<int>(p1v) + static_cast<int>(p2k.length()) + (p3n ? 1 : 0);
}