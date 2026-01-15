/**
 * Test Utilities and Mocks for Edge Function Testing
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * Mock configuration for Supabase client
 */
export interface MockSupabaseConfig {
  chatHistory?: Array<{ id: string; role: string; content: string; created_at: string }>;
  agents?: Array<{ name: string; phone: string; email: string }>;
  shouldError?: boolean;
  errorMessage?: string;
  uploadSuccess?: boolean;
}

/**
 * Creates a mock Supabase client for testing
 * Use this to avoid making real database calls in unit tests
 */
export function createMockSupabaseClient(
  overrides: MockSupabaseConfig = {}
): Partial<SupabaseClient> {
  const config: MockSupabaseConfig = {
    chatHistory: [],
    agents: [],
    shouldError: false,
    errorMessage: "Mock error",
    uploadSuccess: true,
    ...overrides,
  };

  return {
    from: (table: string) => ({
      select: (_columns?: string) => ({
        eq: (_column: string, _value: unknown) => ({
          gte: (_column: string, _value: unknown) => ({
            error: config.shouldError ? { message: config.errorMessage } : null,
            count: config.chatHistory?.length || 0,
            data: config.chatHistory,
          }),
          single: () => ({
            data: config.agents?.[0] || null,
            error: config.agents?.length === 0 ? { message: "Not found" } : null,
          }),
          order: (_column: string, _opts?: { ascending: boolean }) => ({
            limit: (_count: number) => ({
              error: config.shouldError ? { message: config.errorMessage } : null,
              data: config.chatHistory,
            }),
          }),
        }),
      }),
      insert: (_data: unknown) => ({
        error: config.shouldError ? { message: config.errorMessage } : null,
        data: { id: "mock-id" },
      }),
      update: (_data: unknown) => ({
        eq: (_column: string, _value: unknown) => ({
          error: config.shouldError ? { message: config.errorMessage } : null,
        }),
      }),
    }),
    storage: {
      from: (_bucket: string) => ({
        upload: (_path: string, _data: unknown, _options?: unknown) =>
          Promise.resolve({
            data: config.uploadSuccess ? { path: "test/path.docx" } : null,
            error: config.uploadSuccess ? null : { message: "Upload failed" },
          }),
        getPublicUrl: (_path: string) => ({
          data: { publicUrl: "https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/public/test/path.docx" },
        }),
        createSignedUrl: (_path: string, _expiresIn: number) =>
          Promise.resolve({
            data: { signedUrl: "https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/sign/test/path.docx?token=abc" },
            error: null,
          }),
      }),
    },
  } as Partial<SupabaseClient>;
}

/**
 * Creates a mock webhook request for testing
 */
export function createMockWebhookRequest(payload: {
  phoneNumber?: string;
  message?: string;
  fromMe?: boolean;
}): Request {
  const body = {
    event: "messages.upsert",
    data: {
      messages: [
        {
          key: {
            remoteJid: `${payload.phoneNumber || "+35799123456"}@s.whatsapp.net`,
            fromMe: payload.fromMe || false,
            id: "mock-message-id",
          },
          message: {
            conversation: payload.message || "Hello",
          },
          pushName: "Test User",
        },
      ],
    },
  };

  return new Request("https://test.supabase.co/functions/v1/sophia-bot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wasend-Signature": "mock-signature",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Creates a mock fetch function for testing external API calls
 */
export function createMockFetch(responses: Map<string, Response>): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    for (const [pattern, response] of responses) {
      if (url.includes(pattern)) {
        return response.clone();
      }
    }

    return new Response("Not found", { status: 404 });
  };
}
