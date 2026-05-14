#include <iostream>
#include <memory>
#include <string>
#include <vector>
#include <functional>

struct Data {
    int id;
    double score;
    std::string name;
    Data(int i, double s, const std::string& n) : id(i), score(s), name(n) {}
};

std::unique_ptr<Data> createData() {
    return std::unique_ptr<Data>(new Data(1, 0.5, "original"));
}

std::unique_ptr<Data> createDataMove() {
    auto d = std::make_unique<Data>(2, 0.8, "moved");
    return d;
}

class RAIIWrapper {
    int* resource;
    bool valid;
public:
    RAIIWrapper(int initial) : valid(true) {
        resource = new int(initial);
        std::cout << "RAIIWrapper constructed with " << *resource << "\n";
    }
    ~RAIIWrapper() {
        if (valid && resource) {
            std::cout << "RAIIWrapper destroyed, releasing " << *resource << "\n";
            delete resource;
        }
        valid = false;
    }
    RAIIWrapper(const RAIIWrapper&) = delete;
    RAIIWrapper& operator=(const RAIIWrapper&) = delete;
    RAIIWrapper(RAIIWrapper&& other) noexcept : resource(other.resource), valid(other.valid) {
        other.resource = nullptr;
        other.valid = false;
    }
    RAIIWrapper& operator=(RAIIWrapper&& other) noexcept {
        if (this != &other) {
            if (resource) delete resource;
            resource = other.resource;
            valid = other.valid;
            other.resource = nullptr;
            other.valid = false;
        }
        return *this;
    }
    int getValue() const { return valid && resource ? *resource : 0; }
    void setValue(int v) { if (valid && resource) *resource = v; }
};

int main() {
    auto d = createData();
    int data_id = d->id;
    d->score = 0.9;
    d.reset();

    auto d2 = createDataMove();
    auto moved_d = std::move(d2);

    std::shared_ptr<Data> shared = std::make_shared<Data>(3, 0.7, "shared");
    auto copy = shared;
    shared->score = 0.95;
    int ref_count = static_cast<int>(copy.use_count());

    int x = 10;
    auto byVal = [=]() { return x; };
    auto byRef = [&]() { x++; return x; };
    int val_captured = byVal();
    int ref_captured = byRef();

    int y = 5;
    auto mixed = [&, y]() { return x + y; };

    std::string str = "hello";
    auto moved_str = std::move(str);
    bool str_empty = str.empty();

    RAIIWrapper wrapper1(100);
    RAIIWrapper wrapper2(std::move(wrapper1));
    int w2_val = wrapper2.getValue();
    wrapper2.setValue(200);
    int w2_new = wrapper2.getValue();

    std::function<int(int, int)> add = [](int a, int b) { return a + b; };
    int added = add(3, 4);

    return data_id + ref_count + val_captured + ref_captured + (str_empty ? 1 : 0) + w2_new;
}