/* DFA EDGE CASE: concurrency
 * Tests concurrent data flow through threads, futures, atomics, and mutexes.
 * Static DFA cannot model non-deterministic interleaving, but should still
 * identify variable definitions/uses at syntactic level.
 *
 * DFA EXPECTED: Can trace shared→after_thread, async_result, loaded, protected_val
 * STATIC LIMITATION: Cannot determine which thread writes first (race condition)
 * TAG: LIKELY_FAIL — atomic operations and cross-thread flow beyond line-scan
 */

#include <iostream>
#include <thread>
#include <future>
#include <atomic>
#include <mutex>
#include <chrono>

int main() {
    // Thread with lambda capture by reference
    int shared = 0;
    std::thread t([&] {
        shared = 42;  // definition in lambda
    });
    t.join();
    int after_thread = shared;  // use of shared after thread join

    // Async with future
    std::future<int> fut = std::async(std::launch::async, [] {
        return 42;
    });
    int async_result = fut.get();  // data flow from lambda return

    // Atomic operations
    std::atomic<int> counter{0};
    counter.store(99, std::memory_order_relaxed);
    int loaded = counter.load(std::memory_order_acquire);  // atomic read

    // Mutex-protected shared variable
    std::mutex mtx;
    int protected_val = 0;
    {
        std::lock_guard<std::mutex> lock(mtx);
        protected_val = 123;  // definition under lock
    }

    // Promise/Future pair
    std::promise<int> prom;
    std::future<int> fut2 = prom.get_future();
    std::thread producer([&] {
        int value = 77;
        prom.set_value(value);  // value flows into promise
    });
    int promised_value = fut2.get();  // value flows out of future
    producer.join();

    int result = after_thread + async_result + loaded + protected_val + promised_value;
    return result;
}
