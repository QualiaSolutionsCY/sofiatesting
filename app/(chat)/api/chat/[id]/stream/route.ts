import type { NextRequest } from "next/server";

/**
 * Resume stream endpoint for AI SDK
 *
 * This endpoint is called by the AI SDK's resumeStream() function
 * to resume an ongoing chat stream. Currently, we don't support
 * server-side stream persistence, so we return 204 No Content
 * to indicate there's no stream to resume.
 *
 * See: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#resume-stream
 */
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // Await params to extract chatId (not used currently, but available for future logging)
  await params;

  // Return 204 No Content - no stream to resume
  // The AI SDK handles this gracefully and doesn't show an error
  return new Response(null, { status: 204 });
};
