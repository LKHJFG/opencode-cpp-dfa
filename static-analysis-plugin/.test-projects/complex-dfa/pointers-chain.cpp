#include <cstddef>

int global_val = 100;

int reset(int*& p) {
    static int internal = 42;
    p = &internal;
    return internal;
}

int modify_ptr(int** pp) {
    if (pp != nullptr && *pp != nullptr) {
        **pp = (**pp) * 2;
        return **pp;
    }
    return 0;
}

int deref_ptr(int** pp) {
    if (pp != nullptr && *pp != nullptr) {
        return **pp;
    }
    return -1;
}

int get_by_index(const char* names[], int idx) {
    if (idx >= 0 && idx < 3) {
        return static_cast<int>(names[idx][0]);
    }
    return -1;
}

void shift_left(int** arr, int count) {
    for (int i = 0; i < count - 1; i++) {
        arr[i] = arr[i + 1];
    }
    arr[count - 1] = nullptr;
}

int main() {
    int x = 10;
    int* p = &x;
    int** pp = &p;
    int*** ppp = &pp;

    int val1 = *p;
    int val2 = **pp;
    int val3 = ***ppp;

    int arr[5] = {10, 20, 30, 40, 50};
    int* ptr = arr;
    int offset_val = *(ptr + 2);
    int base_val = ptr[1];

    const char* names[3] = {"alpha", "beta", "gamma"};
    int name_len = static_cast<int>(names[0][0]);

    int target = 77;
    int* target_ptr = &target;
    int*& ref_ptr = target_ptr;
    int reset_result = reset(ref_ptr);
    int after_reset = *target_ptr;

    int* ptrs[3] = {&x, arr, &global_val};
    int ptr_val = *ptrs[0];
    shift_left(ptrs, 3);
    int shifted_val = (ptrs[0] != nullptr) ? *ptrs[0] : -1;

    int modify_result = modify_ptr(&ptr);
    int deref_result = deref_ptr(&ptr);

    return val1 + val2 + val3 + offset_val + base_val + name_len + after_reset + shifted_val;
}