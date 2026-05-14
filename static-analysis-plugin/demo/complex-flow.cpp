// Demo: Complex data flow in C++
// This file demonstrates various data flow patterns the DFA engine can trace

#include <iostream>
#include <vector>

struct SensorData {
  double raw_value;
  double calibrated_value;
  int status;
};

// Function: calibrate a sensor reading
double calibrate(double raw, double offset) {
  double adjusted = raw + offset;       // adjusted flows from raw + offset
  double final = adjusted * 1.05;        // final flows from adjusted
  return final;                          // return flows from final
}

int main() {
  // Pattern 1: Basic assignment chain
  int a = 10;                            // a defined
  int b = a + 5;                         // b gets value from a
  int c = b * 2;                         // c gets value from b
  int d = c - 3;                         // d gets value from c

  // Pattern 2: Pointer indirection
  int x = 42;                            // x defined
  int* p = &x;                           // p points to x
  int y = *p;                            // y gets value through p
  int z = y + 1;                         // z flows from y

  // Pattern 3: Function call with data flow
  double sensor_raw = 100.0;
  double offset = 0.5;
  double result = calibrate(sensor_raw, offset);  // result flows from return of calibrate

  // Pattern 4: Struct field access
  SensorData sd;
  sd.raw_value = sensor_raw;
  sd.calibrated_value = result;
  sd.status = 1;

  // Pattern 5: Complex expression chain
  int e = d + z;
  int f = e * 2;
  int g = f - 5;

  return g;
}
