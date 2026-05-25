/**
 * Shared test helpers — narrowing assertions that the test suite can rely on
 * without scattering `!` non-null assertions everywhere.
 *
 * Prefer `assertDefined(x)` over `x!` in tests: the assert keeps a meaningful
 * runtime error message and satisfies `@typescript-eslint/no-non-null-assertion`
 * without disabling the rule.
 */

export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined")
  }
}
