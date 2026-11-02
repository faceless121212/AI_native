// Tiny assert helpers for the eval tests on node:assert (built into Deno), so the tests need no
// extra dependency and ESLint can resolve the import.
import nodeAssert from 'node:assert/strict';

export function assert(value: unknown, message?: string): asserts value {
  nodeAssert.ok(value, message);
}

export function assertFalse(value: unknown, message?: string): void {
  nodeAssert.ok(!value, message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  nodeAssert.deepStrictEqual(actual, expected, message);
}
