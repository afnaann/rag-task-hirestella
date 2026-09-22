/**
 * RAG Evaluation Runner — npm run test:eval
 *
 * Runs the small regression evaluation set from eval/questions.json against the
 * production RAG system at POST /api/chat.
 *
 * Evaluates:
 *   1. Expected behavioral mode (direct_positive, direct_negative, mixed, deterministic_scope)
 *   2. Factual grounding (expected concept presence without exact string rigidity)
 *   3. Absence of forbidden leakage (no "Source 1", "According to the documents", etc.)
 *   4. Consistent third-person perspective (no "I built" or "my experience")
 *   5. Deterministic evidence gate compliance for off-domain/greetings (no LLM calls)
 *
 * Scoring Model:
 *   - Each evaluation case has distinct deterministic checks.
 *   - Case score = (passed checks / total checks) * 10 points.
 *   - Total evaluation score = sum of case scores (out of 100).
 *
 * Usage:
 *   npm run test:eval
 */

import fs from "fs";
import path from "path";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE_URL = process.env["TEST_BASE_URL"] ?? "http://localhost:3000";
const CHAT_ENDPOINT = `${BASE_URL}/api/chat`;
const QUESTIONS_PATH = path.resolve(process.cwd(), "eval/questions.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpectedBehavior =
  | "answer"
  | "direct_positive"
  | "direct_negative"
  | "undocumented_preference"
  | "mixed"
  | "deterministic_scope";

interface EvalQuestion {
  id: string;
  name: string;
  category: string;
  question: string;
  expectedBehavior: ExpectedBehavior;
  expectedFacts?: string[][];
  expectedPatterns?: string[];
  forbiddenPatterns?: string[];
  notes?: string;
}

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

interface CheckResult {
  name: string;
  passed: boolean;
  reason?: string;
}

interface CaseResult {
  question: EvalQuestion;
  response: ChatResponse | null;
  error?: string;
  checks: CheckResult[];
  passed: boolean;
  score: number;
}

// ---------------------------------------------------------------------------
// Assertion Helpers
// ---------------------------------------------------------------------------

function isThirdPerson(answer: string): boolean {
  const lower = answer.toLowerCase();
  return !lower.match(
    /\b(i am|i have|i built|i designed|i developed|i worked|my experience|my projects|my skills)\b/
  );
}

function checkForbiddenPatterns(
  answer: string,
  patterns: string[] = []
): { passed: boolean; matched?: string } {
  const lower = answer.toLowerCase();
  for (const pat of patterns) {
    if (lower.includes(pat.toLowerCase())) {
      return { passed: false, matched: pat };
    }
  }
  return { passed: true };
}

function checkFactGroups(
  answer: string,
  groups: string[][] = []
): { passed: boolean; missingGroup?: string[] } {
  const lower = answer.toLowerCase();
  for (const group of groups) {
    const hasAny = group.some((term) => lower.includes(term.toLowerCase()));
    if (!hasAny) {
      return { passed: false, missingGroup: group };
    }
  }
  return { passed: true };
}

function checkPatterns(
  answer: string,
  patterns: string[] = []
): { passed: boolean; missingPattern?: string } {
  const lower = answer.toLowerCase();
  for (const pat of patterns) {
    if (!lower.includes(pat.toLowerCase())) {
      return { passed: false, missingPattern: pat };
    }
  }
  return { passed: true };
}

// ---------------------------------------------------------------------------
// Evaluator for a single question
// ---------------------------------------------------------------------------

function evaluateCase(q: EvalQuestion, res: ChatResponse): CheckResult[] {
  const checks: CheckResult[] = [];
  const lower = res.answer.toLowerCase();

  // 1. Evidence Gate / Provider Check
  if (q.expectedBehavior === "deterministic_scope") {
    checks.push({
      name: "Gate refused (no LLM call)",
      passed: res.refused === true && res.provider === null && res.sources.length === 0,
      reason:
        res.refused !== true || res.provider !== null
          ? `Expected refused=true & provider=null, got refused=${res.refused} provider=${res.provider}`
          : undefined,
    });
  } else {
    checks.push({
      name: "Evidence passed & LLM generated",
      passed: res.refused === false && res.provider !== null && res.sources.length > 0,
      reason:
        res.refused || !res.provider
          ? `Expected refused=false & provider!=null, got refused=${res.refused} provider=${res.provider}`
          : undefined,
    });
  }

  // 2. Behavioral Response Check
  switch (q.expectedBehavior) {
    case "direct_positive": {
      const startsYes = lower.startsWith("yes") || lower.includes("yes,") || lower.includes("yes.");
      checks.push({
        name: "Direct affirmative ('Yes')",
        passed: startsYes,
        reason: !startsYes ? `Expected direct affirmative starting with 'Yes', got: "${res.answer.slice(0, 40)}..."` : undefined,
      });
      break;
    }
    case "direct_negative": {
      const isNegative =
        lower.startsWith("no") ||
        lower.includes("does not have") ||
        lower.includes("did not work") ||
        lower.includes("no experience");
      checks.push({
        name: "Direct negative ('No')",
        passed: isNegative,
        reason: !isNegative ? `Expected direct negative starting with 'No', got: "${res.answer.slice(0, 40)}..."` : undefined,
      });
      break;
    }
    case "undocumented_preference": {
      const statesUndocumented =
        lower.includes("not have a documented favorite") ||
        lower.includes("not have a favorite") ||
        lower.includes("no documented favorite") ||
        lower.includes("does not specify a favorite") ||
        lower.includes("not documented") ||
        lower.includes("no favorite");
      checks.push({
        name: "Identifies undocumented preference",
        passed: statesUndocumented,
        reason: !statesUndocumented ? `Expected refusal to speculate on favorite, got: "${res.answer.slice(0, 60)}..."` : undefined,
      });
      break;
    }
    case "mixed": {
      const hasAffirmative =
        lower.includes("yes") ||
        lower.includes("has experience with python") ||
        lower.includes("experience in python") ||
        lower.includes("works with python");
      const hasNegative =
        lower.includes("does not have") ||
        lower.includes("no.") ||
        lower.includes("no,") ||
        lower.includes("no experience") ||
        lower.includes("not have experience");
      checks.push({
        name: "Independent mixed handling (affirms + negates)",
        passed: hasAffirmative && hasNegative,
        reason: !hasAffirmative || !hasNegative ? `Expected affirmative for supported and negative for unsupported` : undefined,
      });
      break;
    }
    case "deterministic_scope": {
      const matchesScope =
        res.answer.includes("I can help with questions about Afnan's experience") ||
        res.answer.includes("What would you like to know?");
      checks.push({
        name: "Deterministic scope redirect text",
        passed: matchesScope,
        reason: !matchesScope ? `Expected scope redirect text, got: "${res.answer}"` : undefined,
      });
      break;
    }
    case "answer": {
      checks.push({
        name: "Non-empty grounded answer",
        passed: res.answer.trim().length > 20,
        reason: res.answer.trim().length <= 20 ? "Answer too short or empty" : undefined,
      });
      break;
    }
  }

  // 3. Expected Facts (if defined)
  if (q.expectedFacts && q.expectedFacts.length > 0) {
    const factCheck = checkFactGroups(res.answer, q.expectedFacts);
    checks.push({
      name: "Required facts present",
      passed: factCheck.passed,
      reason: !factCheck.passed ? `Missing required fact from group: [${factCheck.missingGroup?.join(", ")}]` : undefined,
    });
  }

  // 4. Expected Patterns (if defined)
  if (q.expectedPatterns && q.expectedPatterns.length > 0) {
    const patCheck = checkPatterns(res.answer, q.expectedPatterns);
    checks.push({
      name: "Required patterns present",
      passed: patCheck.passed,
      reason: !patCheck.passed ? `Missing expected pattern: "${patCheck.missingPattern}"` : undefined,
    });
  }

  // 5. Forbidden Patterns (no source leakage or meta-language)
  if (q.forbiddenPatterns && q.forbiddenPatterns.length > 0) {
    const forbCheck = checkForbiddenPatterns(res.answer, q.forbiddenPatterns);
    checks.push({
      name: "No forbidden patterns or leakage",
      passed: forbCheck.passed,
      reason: !forbCheck.passed ? `Detected forbidden phrase: "${forbCheck.matched}"` : undefined,
    });
  }

  // 6. Third-Person Perspective (for non-scope queries)
  if (q.expectedBehavior !== "deterministic_scope") {
    const thirdPerson = isThirdPerson(res.answer);
    checks.push({
      name: "Consistent third-person perspective",
      passed: thirdPerson,
      reason: !thirdPerson ? "Detected first-person candidate phrasing ('I built', 'I have', etc.)" : undefined,
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// HTTP caller
// ---------------------------------------------------------------------------

async function callChat(message: string): Promise<ChatResponse> {
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`HTTP ${res.status}: ${errBody.error ?? "Unknown error"}`);
  }

  return (await res.json()) as ChatResponse;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║         HireStella RAG Evaluation Harness (Phase 4)              ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`\n  Target Endpoint: ${CHAT_ENDPOINT}`);
  console.log(`  Dataset:         ${QUESTIONS_PATH}`);

  // 1. Verify Dataset Exists
  if (!fs.existsSync(QUESTIONS_PATH)) {
    console.error(`\n❌ Evaluation dataset not found at ${QUESTIONS_PATH}`);
    process.exit(1);
  }

  const questions: EvalQuestion[] = JSON.parse(
    fs.readFileSync(QUESTIONS_PATH, "utf-8")
  );
  console.log(`  Cases Loaded:    ${questions.length} evaluation questions\n`);

  // 2. Health check endpoint
  try {
    const ping = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping" }),
    });
    if (ping.status === 0) throw new Error("Connection failed");
  } catch {
    console.error(
      `\n❌ Cannot reach ${CHAT_ENDPOINT}\n` +
        `   Make sure the dev server is running ("npm run dev" in another terminal).\n`
    );
    process.exit(1);
  }

  // 3. Run Evaluation Cases
  const results: CaseResult[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    process.stdout.write(`  [${q.id}] ${q.name.padEnd(46)} `);

    try {
      const response = await callChat(q.question);
      const checks = evaluateCase(q, response);
      const passed = checks.every((c) => c.passed);
      const passedCount = checks.filter((c) => c.passed).length;
      const score = Math.round((passedCount / checks.length) * 10);

      console.log(passed ? `✅ PASS  (${score}/10)` : `❌ FAIL  (${score}/10)`);
      results.push({ question: q, response, checks, passed, score });
    } catch (err) {
      console.log("💥 ERROR");
      results.push({
        question: q,
        response: null,
        error: err instanceof Error ? err.message : String(err),
        checks: [{ name: "Execution", passed: false, reason: String(err) }],
        passed: false,
        score: 0,
      });
    }

    // Gentle delay to avoid bursting API quotas
    await new Promise((r) => setTimeout(r, 600));
  }

  // 4. Detailed Failure Diagnostics (if any)
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("\n\n══════════════════ FAILURE DIAGNOSTICS ══════════════════\n");
    for (const f of failures) {
      console.log(`[${f.question.id}] ${f.question.name}`);
      console.log(`Query:             "${f.question.question}"`);
      console.log(`Expected Behavior: ${f.question.expectedBehavior}`);
      if (f.response) {
        console.log(`Actual Answer:     "${f.response.answer}"`);
        console.log(`Provider:          ${f.response.provider ?? "null"}`);
      } else {
        console.log(`Error:             ${f.error}`);
      }
      console.log(`Failed Checks:`);
      for (const c of f.checks.filter((chk) => !chk.passed)) {
        console.log(`  ❌ ${c.name}: ${c.reason}`);
      }
      console.log("────────────────────────────────────────────────────────");
    }
  }

  // 5. Summary Table
  console.log("\n\n══════════════════════════════ EVALUATION SUMMARY ══════════════════════════════");
  console.log(
    "ID   Evaluation Case                              Category            Score  Status"
  );
  console.log("─".repeat(80));

  let totalScore = 0;
  let totalPassed = 0;

  for (const r of results) {
    const id = r.question.id.padEnd(5);
    const name = r.question.name.slice(0, 42).padEnd(45);
    const cat = r.question.category.slice(0, 18).padEnd(20);
    const scoreStr = `${r.score}/10`.padEnd(7);
    const status = r.passed ? "✅ PASS" : "❌ FAIL";

    console.log(`${id}${name}${cat}${scoreStr}${status}`);
    totalScore += r.score;
    if (r.passed) totalPassed++;
  }

  console.log("─".repeat(80));
  const overallPercentage = Math.round((totalScore / (questions.length * 10)) * 100);

  console.log(`\n  Cases Passed:  ${totalPassed}/${questions.length}`);
  console.log(`  Overall Score: ${overallPercentage}/100\n`);

  if (totalPassed < questions.length) {
    console.log("❌ Evaluation finished with regressions/failures.");
    process.exit(1);
  } else {
    console.log("✅ All evaluation regression tests passed successfully!");
  }
}

main().catch((err: unknown) => {
  console.error("\n❌ Fatal error running evaluation runner:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
