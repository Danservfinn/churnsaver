// Test Framework for Whop SDK Tests
// Simple test utilities following the pattern from existing tests

export const test = (name: string, fn: () => void) => {
  console.log(`🧪 ${name}`);
  try {
    fn();
    console.log(`✅ ${name} - PASSED`);
  } catch (error) {
    console.log(`❌ ${name} - FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

export const describe = (name: string, fn: () => void) => {
  console.log(`\n📋 ${name}`);
  fn();
};

export const it = test;

export const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${actual} to be truthy`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected ${actual} to be falsy`);
    }
  },
  toContain: (expected: any) => {
    if (!actual || !actual.includes || !actual.includes(expected)) {
      throw new Error(`Expected ${actual} to contain ${expected}`);
    }
  },
  toHaveLength: (expected: number) => {
    if (!actual || actual.length !== expected) {
      throw new Error(`Expected length ${expected}, but got ${actual ? actual.length : 'undefined'}`);
    }
  },
  toBeInstanceOf: (expected: any) => {
    if (!(actual instanceof expected)) {
      throw new Error(`Expected instance of ${expected.name}, but got ${typeof actual}`);
    }
  },
  toThrow: () => {
    if (typeof actual !== 'function') {
      throw new Error(`Expected function to throw`);
    }
    try {
      actual();
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error(`Expected Error to be thrown, but got ${typeof error}`);
      }
      return; // Test passed - function threw an Error
    }
    throw new Error('Expected function to throw, but it did not');
  },
  rejects: () => {
    if (typeof actual !== 'function') {
      throw new Error(`Expected function to reject`);
    }
    try {
      actual();
      throw new Error('Expected function to reject, but it resolved');
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error(`Expected Error to be thrown, but got ${typeof error}`);
      }
      return; // Test passed - function threw an Error
    }
  },
  resolves: () => {
    if (typeof actual !== 'function') {
      throw new Error(`Expected function to resolve`);
    }
    try {
      const result = actual();
      if (!(result instanceof Promise)) {
        throw new Error('Expected function to return a Promise');
      }
      return result;
    } catch (error) {
      throw new Error(`Expected function to resolve, but it threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});