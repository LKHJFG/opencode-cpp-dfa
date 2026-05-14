#ifndef COMPLEX_FLOW_MATH_UTILS_H
#define COMPLEX_FLOW_MATH_UTILS_H

/**
 * math_utils.h — Simple arithmetic and transformation utilities.
 * All functions are pure (no side effects) for clean data flow testing.
 */

int add(int a, int b);
int multiply(int a, int b);
int computeValue(int x, int y);
int accumulate(int* arr, int len);
int square(int x);
int cube(int x);
int clamp(int value, int min, int max);

#endif // COMPLEX_FLOW_MATH_UTILS_H
