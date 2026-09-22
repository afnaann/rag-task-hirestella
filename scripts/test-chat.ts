/**
 * Chat API test script — npm run test:chat
 *
 * Calls the running local Next.js dev server at POST /api/chat.
 * Tests conversational quality, direct Yes/No answers, third-person perspective,
 * zero retrieval/source leakage, strict grounding, deterministic scope redirection,
 * and provider fallback.
 *
 * PREREQUISITES:
 *   1. npm run dev          (in a separate terminal)
 *   2. GOOGLE_API_KEY set in .env.local
 *   3. GROQ_API_KEY set in .env.local
 *
 * FALLBACK TEST:
 *   LLM_FORCE_PRIMARY_FAILURE=true npm run test:chat
 *   (Groq will simulate a transient failure; Gemini fallback takes over)
 *
 * Usage:
 *   npm run test:chat
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const BASE_URL = process.env["TEST_BASE_URL"] ?? "http://localhost:3000";
const CHAT_ENDPOINT = `${BASE_URL}/api/chat`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatResponse {
  answer: string;
  sources: Array<{
    chunkId: string;
    documentName: string;
    heading?: string;
    score: number;
  }>;
  grounded: boolean;
  refused: boolean;
  provider: "groq" | "gemini" | null;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Conversational Quality Assertion Helpers
// ---------------------------------------------------------------------------

/** Ensures the answer doesn't speak in first person as the candidate */
function isThirdPerson(answer: string): boolean {
  const lower = answer.toLowerCase();
  return !lower.match(/\b(i am|i have|i built|i designed|i developed|i worked|my experience|my projects|my skills)\b/);
}

/** Ensures no internal retrieval mechanics or meta-explanations leak into user text */
function hasNoSourceLeakage(answer: string): boolean {
  const lower = answer.toLowerCase();
  return (
    !lower.includes("source 1") &&
    !lower.includes("source 2") &&
    !lower.includes("according to") &&
    !lower.includes("based on the") &&
    !lower.includes("retrieved document") &&
    !lower.includes("provided context") &&
    !lower.includes("available context") &&
    !lower.includes("available documents") &&
    !lower.includes("documents do not") &&
    !lower.includes("documents don't") &&
    !lower.includes("i don't have information") &&
    !lower.includes("i cannot confirm") &&
    !lower.includes("there is no information indicating") &&
    !lower.includes("provided information does not") &&
    !answer.includes("[Source") &&
    !answer.includes("【Source")
  );
}

/** Ensures response is concise */
function isConcise(answer: string, maxChars = 1000): boolean {
  return answer.length > 0 && answer.length <= maxChars;
}

// ---------------------------------------------------------------------------
// Test case definitions
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  category: string;
  message: string;
  /** Assertions to run against the response */
  checks: Array<{
    description: string;
    test: (res: ChatResponse) => boolean;
  }>;
  notes: string;
}

const TEST_CASES: TestCase[] = [
  // ------------------------------------------------------------------
  // 1. Strong answerable query
  // ------------------------------------------------------------------
  {
    id: "T1",
    category: "Supported (LangGraph)",
    message: "What has Afnan built with LangGraph?",
    checks: [
      { description: "provider not null (LLM called)", test: (r) => r.provider !== null },
      { description: "refused = false", test: (r) => r.refused === false },
      { description: "sources returned in metadata", test: (r) => r.sources.length > 0 },
      { description: "speaks in third person", test: (r) => isThirdPerson(r.answer) },
      { description: "no source or retrieval leakage", test: (r) => hasNoSourceLeakage(r.answer) },
      { description: "concise response", test: (r) => isConcise(r.answer) },
      {
        description: "mentions Wiral or multi-agent platform",
        test: (r) =>
          r.answer.toLowerCase().includes("wiral") ||
          r.answer.toLowerCase().includes("agent"),
      },
    ],
    notes: "Wiral AI project doc describes multi-agent platform using LangGraph.",
  },

  // ------------------------------------------------------------------
  // 2. Direct positive answer (MCP)
  // ------------------------------------------------------------------
  {
    id: "T2",
    category: "Direct positive (MCP)",
    message: "Does Afnan have experience with MCP?",
    checks: [
      { description: "refused = false", test: (r) => r.refused === false },
      { description: "provider not null", test: (r) => r.provider !== null },
      { description: "direct positive answer ('Yes')", test: (r) => r.answer.toLowerCase().startsWith("yes") },
      { description: "mentions MCP", test: (r) => r.answer.toLowerCase().includes("mcp") },
      { description: "third person", test: (r) => isThirdPerson(r.answer) },
      { description: "no source or retrieval leakage", test: (r) => hasNoSourceLeakage(r.answer) },
      { description: "concise response", test: (r) => isConcise(r.answer) },
    ],
    notes: "Direct positive answer with key supporting detail.",
  },

  // ------------------------------------------------------------------
  // 3. Direct negative answer (Canva)
  // ------------------------------------------------------------------
  {
    id: "T3",
    category: "Direct negative (Canva)",
    message: "Does Afnan have experience with Canva?",
    checks: [
      { description: "refused = false", test: (r) => r.refused === false },
      { description: "provider not null", test: (r) => r.provider !== null },
      { description: "direct negative answer ('No')", test: (r) => r.answer.toLowerCase().startsWith("no") },
      { description: "states does not have experience with Canva", test: (r) => r.answer.toLowerCase().includes("not have") || r.answer.toLowerCase().includes("does not have") },
      { description: "third person", test: (r) => isThirdPerson(r.answer) },
      { description: "no source or retrieval leakage", test: (r) => hasNoSourceLeakage(r.answer) },
      { description: "concise one-line answer", test: (r) => isConcise(r.answer, 250) },
    ],
    notes: "Direct negative recruiter answer without meta-explanations.",
  },

  // ------------------------------------------------------------------
  // 4. Employment gap (Google)
  // ------------------------------------------------------------------
  {
    id: "T4",
    category: "Direct negative (Google)",
    message: "Did Afnan work at Google?",
    checks: [
      { description: "refused = false", test: (r) => r.refused === false },
      { description: "provider not null", test: (r) => r.provider !== null },
      { description: "direct negative answer ('No')", test: (r) => r.answer.toLowerCase().startsWith("no") },
      { description: "states did not work at Google", test: (r) => r.answer.toLowerCase().includes("did not work") || r.answer.toLowerCase().includes("not work") },
      { description: "third person", test: (r) => isThirdPerson(r.answer) },
      { description: "no source or retrieval leakage", test: (r) => hasNoSourceLeakage(r.answer) },
      { description: "concise one-line answer", test: (r) => isConcise(r.answer, 250) },
    ],
    notes: "Authoritative negative answer on employment gap.",
  },

  // ------------------------------------------------------------------
  // 5. Undocumented preference (favorite programming language)
  // ------------------------------------------------------------------
  {
    id: "T5",
    category: "Undocumented preference",
    message: "What is Afnan's favorite programming language?",
    checks: [
      { description: "refused = false", test: (r) => r.refused === false },
      { description: "provider not null", test: (r) => r.provider !== null },
      {
        description: "states does not have a documented favorite",
        test: (r) =>
          r.answer.toLowerCase().includes("not have a documented favorite") ||
          r.answer.toLowerCase().includes("not have a favorite") ||
          r.answer.toLowerCase().includes("no documented favorite"),
      },
      { description: "third person", test: (r) => isThirdPerson(r.answer) },
      { description: "no source or retrieval leakage", test: (r) => hasNoSourceLeakage(r.answer) },
      { description: "concise answer", test: (r) => isConcise(r.answer, 250) },
    ],
    notes: "Does not fabricate a favorite from the list of known languages.",
  },

  // ------------------------------------------------------------------
  // 6. Mixed question (Python and Canva)
  // ------------------------------------------------------------------
  {
    id: "T6",
    category: "Mixed question (Python & Canva)",
    message: "Does Afnan have experience with Python and Canva?",
    checks: [
      { description: "refused = false", test: (r) => r.refused === false },
      { description: "provider not null", test: (r) => r.provider !== null },
      { description: "affirms Python experience", test: (r) => r.answer.toLowerCase().includes("python") && (r.answer.toLowerCase().includes("yes") || r.answer.toLowerCase().includes("experience with python")) },
      { description: "negates Canva experience", test: (r) => r.answer.toLowerCase().includes("canva") && (r.answer.toLowerCase().includes("not have") || r.answer.toLowerCase().includes("no experience")) },
      { description: "third person", test: (r) => isThirdPerson(r.answer) },
      { description: "no source or retrieval leakage", test: (r) => hasNoSourceLeakage(r.answer) },
      { description: "concise response", test: (r) => isConcise(r.answer, 500) },
    ],
    notes: "Independently affirms Python and negates Canva.",
  },

  // ------------------------------------------------------------------
  // 7. Off-domain question → deterministic scope redirect
  // ------------------------------------------------------------------
  {
    id: "T7",
    category: "Deterministic scope (off-domain)",
    message: "How do I make sourdough bread?",
    checks: [
      { description: "refused = true", test: (r) => r.refused === true },
      { description: "provider = null (no LLM call)", test: (r) => r.provider === null },
      { description: "sources empty", test: (r) => r.sources.length === 0 },
      {
        description: "matches scope redirect text",
        test: (r) =>
          r.answer.includes("I can help with questions about Afnan's experience") ||
          r.answer.toLowerCase().includes("what would you like to know"),
      },
    ],
    notes: "Off-domain query — retrieval gate must fire. NO LLM call.",
  },

  // ------------------------------------------------------------------
  // 8. Greeting → deterministic scope redirect without hardcoded router
  // ------------------------------------------------------------------
  {
    id: "T8",
    category: "Deterministic scope (greeting)",
    message: "Hi",
    checks: [
      { description: "refused = true", test: (r) => r.refused === true },
      { description: "provider = null (no LLM call)", test: (r) => r.provider === null },
      { description: "sources empty", test: (r) => r.sources.length === 0 },
      {
        description: "matches scope redirect text",
        test: (r) =>
          r.answer.includes("I can help with questions about Afnan's experience") ||
          r.answer.toLowerCase().includes("what would you like to know"),
      },
    ],
    notes: "Greeting enters no-evidence gate naturally without hardcoded checks.",
  },
];

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function callChatAPI(
  message: string
): Promise<{ ok: true; data: ChatResponse } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({ error: "unknown" }))) as ErrorResponse;
      return { ok: false, status: res.status, error: body.error ?? res.statusText };
    }

    const data = (await res.json()) as ChatResponse;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function hr(char = "─", width = 70) {
  return char.repeat(width);
}

function truncate(s: string, max = 160) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function printSources(
  sources: ChatResponse["sources"],
  indent = "    "
): void {
  if (sources.length === 0) {
    console.log(`${indent}(no sources)`);
    return;
  }
  for (const src of sources) {
    console.log(
      `${indent}• ${src.documentName}${src.heading ? ` / ${src.heading}` : ""} [score=${src.score.toFixed(4)}]`
    );
  }
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

async function runTests(): Promise<void> {
  const isFallbackTest = process.env["LLM_FORCE_PRIMARY_FAILURE"] === "true";

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║         Phase 3.1 Revision — Direct & Grounded Chat Test        ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`\n  Endpoint: ${CHAT_ENDPOINT}`);
  if (isFallbackTest) {
    console.log("  ⚠️  LLM_FORCE_PRIMARY_FAILURE=true — testing Gemini fallback path");
  }
  console.log(`  Cases: ${TEST_CASES.length}\n`);

  // Quick connectivity check
  try {
    const ping = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping" }),
    });
    if (ping.status === 0) throw new Error("no response");
  } catch {
    console.error(
      `\n❌ Cannot reach ${CHAT_ENDPOINT}\n` +
        `   Make sure "npm run dev" is running in another terminal.\n`
    );
    process.exit(1);
  }

  const results: Array<{
    tc: TestCase;
    response: ChatResponse | null;
    passed: boolean;
    checkResults: Array<{ description: string; passed: boolean }>;
  }> = [];

  for (const tc of TEST_CASES) {
    console.log(`\n${hr()}`);
    console.log(`[${tc.id}] ${tc.category}`);
    console.log(`Query: "${tc.message}"`);

    const apiResult = await callChatAPI(tc.message);

    if (!apiResult.ok) {
      console.log(`  ❌ HTTP Error ${apiResult.status}: ${apiResult.error}`);
      results.push({ tc, response: null, passed: false, checkResults: [] });
      continue;
    }

    const res = apiResult.data;

    // Run checks
    const checkResults = tc.checks.map((chk) => {
      let passed: boolean;
      try {
        passed = chk.test(res);
      } catch {
        passed = false;
      }
      return { description: chk.description, passed };
    });

    const allPassed = checkResults.every((c) => c.passed);

    // Print response summary
    console.log(`\n  refused=${res.refused}  provider=${res.provider ?? "null"}  sources=${res.sources.length}`);
    console.log(`  Answer: ${truncate(res.answer, 240)}`);
    console.log(`  Sources:`);
    printSources(res.sources);

    // Print check results
    console.log(`\n  Checks:`);
    for (const chk of checkResults) {
      console.log(`    ${chk.passed ? "✅" : "❌"} ${chk.description}`);
    }

    if (tc.notes) {
      console.log(`\n  Note: ${tc.notes}`);
    }

    results.push({ tc, response: res, passed: allPassed, checkResults });
  }

  // ------------------------------------------------------------------
  // Summary table
  // ------------------------------------------------------------------
  console.log(`\n\n${hr("═")}`);
  console.log("SUMMARY");
  console.log(hr("═"));
  console.log(
    "ID   Category                            Refused  Provider  Checks    Result"
  );
  console.log(hr());

  let totalPassed = 0;
  for (const { tc, response, passed, checkResults } of results) {
    const refused = response?.refused ?? "?";
    const provider = response?.provider ?? "null";
    const checksStr = `${checkResults.filter((c) => c.passed).length}/${checkResults.length}`;
    const status = passed ? "✅ PASS" : "❌ FAIL";
    console.log(
      `${tc.id.padEnd(5)}${tc.category.slice(0, 36).padEnd(37)}${String(refused).padEnd(9)}${provider.padEnd(10)}${checksStr.padEnd(10)}${status}`
    );
    if (passed) totalPassed++;
  }

  console.log(hr());
  console.log(`\n  Results: ${totalPassed}/${results.length} test cases fully passed`);

  if (isFallbackTest) {
    const fallbackResults = results.filter(
      (r) => r.response?.provider === "gemini"
    );
    console.log(
      `\n  Fallback test: ${fallbackResults.length} response(s) served by Gemini`
    );
    if (fallbackResults.length === 0) {
      console.log(
        "  ⚠️  Expected Gemini fallback but no responses used Gemini. " +
          "Check LLM_FORCE_PRIMARY_FAILURE is set server-side."
      );
    }
  }

  console.log("\n");

  if (totalPassed < results.length) {
    process.exit(1);
  }
}

runTests().catch((err: unknown) => {
  console.error("\n❌ Test runner error:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
