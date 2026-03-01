/**
 * Vitest Setup for Edge Function Tests
 *
 * Mocks Deno globals and common dependencies for testing
 * Supabase Edge Functions in a Node.js environment.
 */
import { vi } from "vitest";

// Mock Deno environment
const mockEnv = new Map<string, string>();

// @ts-expect-error - Mocking Deno global
globalThis.Deno = {
  env: {
    get: (key: string) => mockEnv.get(key),
    set: (key: string, value: string) => mockEnv.set(key, value),
    delete: (key: string) => mockEnv.delete(key),
    toObject: () => Object.fromEntries(mockEnv),
  },
};

// Helper to set environment variables in tests
export const setEnv = (key: string, value: string): void => {
  mockEnv.set(key, value);
};

export const clearEnv = (): void => {
  mockEnv.clear();
};

// Setup default env vars that are always needed
setEnv("SUPABASE_URL", "https://test.supabase.co");
setEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

// Mock console to suppress logs during tests (can be overridden)
const originalConsole = { ...console };
export const mockConsole = (): void => {
  console.log = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
  console.debug = vi.fn();
};

export const restoreConsole = (): void => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
};

// Mock fetch for external API calls
export const createMockFetch = (
  responses: Array<{
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }>
): typeof fetch => {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json", ...response.headers },
    });
  }) as unknown as typeof fetch;
};

// Mock Supabase client
export const createMockSupabaseClient = () => {
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => Promise.resolve({ count: 0, error: null })),
        })),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      order: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    insert: vi.fn(() => Promise.resolve({ error: null })),
  }));

  return {
    from: mockFrom,
    _mockFrom: mockFrom, // Expose for assertions
  };
};
