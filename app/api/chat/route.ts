/**
 * POST /api/chat
 *
 * The single server-side entry point for the chat interface.
 *
 * This route is intentionally thin — business logic lives in lib/.
 * The route is responsible only for:
 *   - Request validation
 *   - Calling retrieve() (Phase 2)
 *   - Calling generate() (Phase 3) when evidence exists
 *   - Shaping the response
 *   - Error handling and HTTP status codes
 *   - Server-side logging for observability
 *
 * Security:
 *   - API keys are server-side env vars; never returned to client
 *   - Client provides ONLY the message string
 *   - Client cannot inject context, sources, embeddings, or system prompts
 *   - Raw provider errors are never forwarded to the client
 *
 * This file must remain a Next.js Route Handler (App Router).
 * Do NOT import this file on the client side.
 */

import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval/index";
import { generate } from "@/lib/llm/index";
import { NO_EVIDENCE_RESPONSE, MAX_MESSAGE_CHARS } from "@/lib/config";
import type { ChatResponse, SourceMetadata } from "@/lib/types";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestStart = Date.now();

  // ------------------------------------------------------------------
  // 1. Parse and validate the request body
  // ------------------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "Request body must be a JSON object.");
  }

  const rawMessage = (body as Record<string, unknown>)["message"];
  if (rawMessage === undefined || rawMessage === null) {
    return errorResponse(400, 'Request body must include a "message" field.');
  }
  if (typeof rawMessage !== "string") {
    return errorResponse(400, '"message" must be a string.');
  }

  const message = rawMessage.trim();
  if (message.length === 0) {
    return errorResponse(400, '"message" must not be empty.');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return errorResponse(
      400,
      `"message" must not exceed ${MAX_MESSAGE_CHARS} characters.`
    );
  }

  console.info(`[/api/chat] Query: "${message.slice(0, 80)}${message.length > 80 ? "..." : ""}"`);

  // ------------------------------------------------------------------
  // 2. Retrieval (Phase 2)
  // ------------------------------------------------------------------
  let retrieval: Awaited<ReturnType<typeof retrieve>>;
  try {
    retrieval = await retrieve(message);
  } catch (err) {
    // Retrieval failures (missing store, embedding API error) are 500
    console.error("[/api/chat] Retrieval error:", err instanceof Error ? err.message : err);
    return errorResponse(500, "An error occurred while searching the documents.");
  }

  const d = retrieval.diagnostics;
  console.info(
    `[/api/chat] Retrieval: candidates=${d.candidateCount} ` +
      `returned=${d.returnedCount} maxScore=${d.maxScore?.toFixed(4) ?? "null"} ` +
      `hasEvidence=${retrieval.hasEvidence}`
  );

  // ------------------------------------------------------------------
  // 3. Evidence gate — deterministic refusal when no evidence found
  // ------------------------------------------------------------------
  if (!retrieval.hasEvidence) {
    console.info("[/api/chat] Evidence gate: no evidence — deterministic refusal");
    const elapsed = Date.now() - requestStart;
    console.info(`[/api/chat] Done in ${elapsed}ms (refused, no LLM call)`);

    const response: ChatResponse = {
      answer: NO_EVIDENCE_RESPONSE,
      sources: [],
      grounded: true,
      refused: true,
      provider: null,
    };
    return NextResponse.json(response);
  }

  // ------------------------------------------------------------------
  // 4. Build sources metadata from retrieved chunks
  //    (preserved exactly — not regenerated after LLM call)
  // ------------------------------------------------------------------
  const sources: SourceMetadata[] = retrieval.retrieved.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentName: chunk.documentName,
    heading: chunk.heading,
    score: chunk.score,
  }));

  // ------------------------------------------------------------------
  // 5. LLM generation with provider fallback (Phase 3)
  // ------------------------------------------------------------------
  let generationResult: Awaited<ReturnType<typeof generate>>;
  try {
    generationResult = await generate({
      query: message,
      retrievedChunks: retrieval.retrieved,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[/api/chat] Generation error: ${errMsg}`);

    // "Both providers unavailable" → 503
    if (errMsg.includes("Both LLM providers")) {
      return errorResponse(503, "The AI service is temporarily unavailable. Please try again later.");
    }
    // Anything else → 500
    return errorResponse(500, "An error occurred while generating the response.");
  }

  if (generationResult.usedFallback) {
    console.info("[/api/chat] Used fallback provider: gemini");
  }

  const elapsed = Date.now() - requestStart;
  console.info(
    `[/api/chat] Done in ${elapsed}ms — provider=${generationResult.provider} ` +
      `fallback=${generationResult.usedFallback}`
  );

  // ------------------------------------------------------------------
  // 6. Return grounded response
  // ------------------------------------------------------------------
  const response: ChatResponse = {
    answer: generationResult.answer,
    sources,
    grounded: true,
    refused: false,
    provider: generationResult.provider,
  };

  return NextResponse.json(response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a sanitised JSON error response. Never leaks internal details. */
function errorResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
