/**
 * Retrieval test script — npm run test:retrieval
 *
 * Tests the retrieval layer against the current corpus WITHOUT involving
 * the LLM. The goal is to verify that:
 *
 *   1. Answerable questions retrieve relevant chunks (hasEvidence = true)
 *   2. Unsupported questions fail the evidence gate (hasEvidence = false)
 *
 * This also serves as the calibration tool for RETRIEVAL_MIN_SCORE.
 * Run this after any change to:
 *   - The documents
 *   - The chunking strategy
 *   - The embedding model or dimensions
 *   - The similarity threshold
 *
 * Usage:
 *   npm run test:retrieval
 *
 * No API key for Groq is needed — only GOOGLE_API_KEY for query embedding.
 */

// Load environment variables from .env.local before anything else
import { config } from "dotenv";
config({ path: ".env.local" });

import { retrieve } from "@/lib/retrieval/index";
import type { RetrievalResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Test case definitions
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  category: string;
  query: string;
  /** What we expect: "answer" = hasEvidence true, "refuse" = hasEvidence false */
  expectedBehavior: "answer" | "refuse";
  /** Document(s) we expect to appear in the top results (for answerable cases) */
  expectedDocuments?: string[];
  notes: string;
}

const TEST_CASES: TestCase[] = [
  // ------------------------------------------------------------------
  // A. Answerable — single document
  // ------------------------------------------------------------------
  {
    id: "A1",
    category: "Answerable (single doc)",
    query: "What has Afnan built with LangGraph?",
    expectedBehavior: "answer",
    expectedDocuments: ["project-wiral-ai.md", "faq.md", "AFNAN_PK_AI_ENGINEER.pdf"],
    notes: "Wiral doc, CV, and FAQ detail LangGraph multi-agent systems",
  },
  {
    id: "A2",
    category: "Answerable (single doc)",
    query: "What programming languages does Afnan know?",
    expectedBehavior: "answer",
    expectedDocuments: ["AFNAN_PK_AI_ENGINEER.pdf", "faq.md"],
    notes: "CV and FAQ list Python, TypeScript, SQL, etc.",
  },
  {
    id: "A3",
    category: "Answerable (single doc)",
    query: "Where is Afnan currently located?",
    expectedBehavior: "answer",
    expectedDocuments: ["faq.md", "AFNAN_PK_AI_ENGINEER.pdf"],
    notes: "FAQ and CV state Dubai, UAE",
  },

  // ------------------------------------------------------------------
  // B. Answerable — project-specific
  // ------------------------------------------------------------------
  {
    id: "B1",
    category: "Answerable (project-specific)",
    query: "How does the Wiral multi-agent architecture work with LangGraph?",
    expectedBehavior: "answer",
    expectedDocuments: ["project-wiral-ai.md"],
    notes: "Project 1 describes 3 agents (Enquiry, Booking, Back Office) in LangGraph",
  },
  {
    id: "B2",
    category: "Answerable (project-specific)",
    query: "What was the scale and architecture of the Airflow ETL pipeline at WebMavericks?",
    expectedBehavior: "answer",
    expectedDocuments: ["project-etl-pipeline.md"],
    notes: "Project 2 describes 50+ Airflow pipelines, S3, Redshift, LLM cleaning",
  },

  // ------------------------------------------------------------------
  // C. Answerable — FAQ
  // ------------------------------------------------------------------
  {
    id: "C1",
    category: "Answerable (FAQ)",
    query: "Is Afnan open to remote work?",
    expectedBehavior: "answer",
    expectedDocuments: ["faq.md"],
    notes: "FAQ has a direct 'Is Afnan open to remote work?' section",
  },

  // ------------------------------------------------------------------
  // D. Cross-document
  // ------------------------------------------------------------------
  {
    id: "D1",
    category: "Cross-document",
    query: "What experience does Afnan have with vector databases and RAG?",
    expectedBehavior: "answer",
    expectedDocuments: ["project-wiral-ai.md", "faq.md", "AFNAN_PK_AI_ENGINEER.pdf"],
    notes: "CV, Wiral doc, and FAQ describe Qdrant vector retrieval and RAG pipelines",
  },

  // ------------------------------------------------------------------
  // E. Unsupported — truly off-domain (should fail retrieval gate)
  // ------------------------------------------------------------------
  {
    id: "E1",
    category: "Off-domain (truly unrelated)",
    query: "What is the weather forecast for London tomorrow?",
    expectedBehavior: "refuse",
    notes:
      "Completely off-domain query — no weather information in any document. " +
      "Should score well below threshold for all chunks.",
  },
  {
    id: "E2",
    category: "Off-domain (truly unrelated)",
    query: "How do I make a sourdough bread starter?",
    expectedBehavior: "refuse",
    notes:
      "Completely off-domain — cooking content not in corpus. " +
      "Should fail the evidence gate cleanly.",
  },

  // ------------------------------------------------------------------
  // F. Biography-adjacent gaps (retrieval gate PASSES; LLM must refuse)
  // ------------------------------------------------------------------
  {
    id: "F1",
    category: "Biography gap (LLM must refuse)",
    query: "Has Afnan worked at Google?",
    expectedBehavior: "answer",
    notes:
      "Google is NOT in the corpus, but biographical chunks score high " +
      "because the query is about Afnan's career. Gate correctly passes. " +
      "LLM grounding prompt must refuse — verified in Phase 3.",
  },
  {
    id: "F2",
    category: "Biography gap (LLM must refuse)",
    query: "What is Afnan's favourite video game?",
    expectedBehavior: "answer",
    notes:
      "Corpus does not state a favourite video game. " +
      "Gate may pass biographical context; LLM must refuse to speculate.",
  },
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function bar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function fmt(score: number | null): string {
  return score === null ? " null " : score.toFixed(4);
}

function printResult(tc: TestCase, result: RetrievalResult): string {
  const d = result.diagnostics;
  const gateResult = result.hasEvidence ? "EVIDENCE ✓" : "REFUSED   ✗";
  const behaviorOk =
    (tc.expectedBehavior === "answer" && result.hasEvidence) ||
    (tc.expectedBehavior === "refuse" && !result.hasEvidence);
  const gatePass = behaviorOk ? "✅ PASS" : "❌ FAIL";

  // Check if expected documents appear in top results
  let docCheck = "";
  if (tc.expectedDocuments && result.hasEvidence) {
    const retrievedDocs = result.retrieved.map((c) => c.documentName);
    const found = tc.expectedDocuments.filter((d) => retrievedDocs.includes(d));
    const anyFound = found.length > 0;
    docCheck = anyFound
      ? `  docs: ✅ expected [${found.join(", ")}] found`
      : `  docs: ⚠️  expected [${tc.expectedDocuments.join(", ")}], got [${[...new Set(retrievedDocs)].join(", ")}]`;
  }

  const lines = [
    "",
    `─────────────────────────────────────────────────────────`,
    `[${tc.id}] ${tc.category}`,
    `Query:    "${result.query}"`,
    `Gate:     ${gateResult}   ${gatePass}`,
    `Scores:   max=${fmt(d.maxScore)} 2nd=${fmt(d.secondScore)} threshold=${d.thresholdUsed}`,
    `Returned: ${d.returnedCount}/${d.candidateCount} chunks (topK=${d.topK})`,
  ];

  if (docCheck) lines.push(docCheck);
  if (tc.notes) lines.push(`  note: ${tc.notes}`);

  if (result.retrieved.length > 0) {
    lines.push(`  Top chunks:`);
    for (const chunk of result.retrieved.slice(0, 3)) {
      const scoreBar = bar(Math.max(0, chunk.score));
      lines.push(
        `    ${scoreBar} ${fmt(chunk.score)}  ${chunk.documentName} / ${chunk.heading ?? "(no heading)"}`
      );
    }
  } else {
    lines.push(`  Top candidates (all below threshold):`);
    lines.push(
      `    maxScore=${fmt(d.maxScore)} — below threshold ${d.thresholdUsed}`
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runTests(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         Phase 2 — Retrieval Test                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  Threshold: RETRIEVAL_MIN_SCORE = ${process.env["RETRIEVAL_MIN_SCORE"] ?? "0.55 (default)"}`);
  console.log(`  TopK:      RETRIEVAL_TOP_K     = ${process.env["RETRIEVAL_TOP_K"] ?? "5 (default)"}`);
  console.log(`  Queries:   ${TEST_CASES.length} test cases\n`);

  const results: Array<{ tc: TestCase; result: RetrievalResult; pass: boolean }> = [];

  for (const tc of TEST_CASES) {
    process.stdout.write(`  Running [${tc.id}] "${tc.query.slice(0, 55)}..."  `);
    try {
      const result = await retrieve(tc.query);
      const behaviorOk =
        (tc.expectedBehavior === "answer" && result.hasEvidence) ||
        (tc.expectedBehavior === "refuse" && !result.hasEvidence);
      console.log(behaviorOk ? "✅" : "❌");
      results.push({ tc, result, pass: behaviorOk });
    } catch (err) {
      console.log("💥 ERROR");
      console.error(`     ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        tc,
        result: {
          query: tc.query,
          hasEvidence: false,
          retrieved: [],
          diagnostics: {
            candidateCount: 0,
            returnedCount: 0,
            maxScore: null,
            secondScore: null,
            thresholdUsed: 0.55,
            topK: 5,
            queryEmbeddingDimension: 0,
          },
        },
        pass: false,
      });
    }

    // Gentle delay to avoid burst rate limits on free-tier APIs
    await new Promise((r) => setTimeout(r, 500));
  }

  // Print detailed results
  console.log("\n\n═══════════════ DETAILED RESULTS ═══════════════\n");
  for (const { tc, result } of results) {
    console.log(printResult(tc, result));
  }

  // Summary table
  console.log("\n\n═══════════════ SUMMARY ═══════════════\n");
  console.log(
    "ID   Category                    Query (truncated)               Expected   Gate       Result"
  );
  console.log("─".repeat(105));

  let passed = 0;
  for (const { tc, result, pass } of results) {
    const expected = tc.expectedBehavior.toUpperCase().padEnd(7);
    const gate = result.hasEvidence ? "EVIDENCE" : "REFUSED ";
    const status = pass ? "✅ PASS" : "❌ FAIL";
    const score = result.diagnostics.maxScore !== null
      ? result.diagnostics.maxScore.toFixed(3)
      : " --- ";
    console.log(
      `${tc.id.padEnd(5)}${tc.category.padEnd(28)}${tc.query.slice(0, 32).padEnd(33)}${expected}  ${gate}  maxScore=${score}  ${status}`
    );
    if (pass) passed++;
  }

  const total = results.length;
  console.log("\n" + "─".repeat(105));
  console.log(`\n  Results: ${passed}/${total} passed`);

  // Score distribution analysis
  console.log("\n═══════════════ SCORE DISTRIBUTION ═══════════════\n");
  console.log("  This helps calibrate RETRIEVAL_MIN_SCORE:\n");
  const answerResults = results.filter((r) => r.tc.expectedBehavior === "answer");
  const refuseResults = results.filter((r) => r.tc.expectedBehavior === "refuse");

  const answerScores = answerResults
    .map((r) => r.result.diagnostics.maxScore)
    .filter((s): s is number => s !== null);
  const refuseScores = refuseResults
    .map((r) => r.result.diagnostics.maxScore)
    .filter((s): s is number => s !== null);

  if (answerScores.length > 0) {
    const min = Math.min(...answerScores);
    const max = Math.max(...answerScores);
    const avg = answerScores.reduce((a, b) => a + b, 0) / answerScores.length;
    console.log(
      `  Answerable queries — maxScore: min=${min.toFixed(4)}  avg=${avg.toFixed(4)}  max=${max.toFixed(4)}`
    );
  }

  if (refuseScores.length > 0) {
    const min = Math.min(...refuseScores);
    const max = Math.max(...refuseScores);
    const avg = refuseScores.reduce((a, b) => a + b, 0) / refuseScores.length;
    console.log(
      `  Unsupported queries — maxScore: min=${min.toFixed(4)}  avg=${avg.toFixed(4)}  max=${max.toFixed(4)}`
    );
  }

  if (answerScores.length > 0 && refuseScores.length > 0) {
    const minAnswer = Math.min(...answerScores);
    const maxRefuse = Math.max(...refuseScores);
    const gap = minAnswer - maxRefuse;
    console.log(`\n  Score gap (min answerable − max unsupported): ${gap.toFixed(4)}`);
    if (gap > 0) {
      console.log(`  ✅ Clear separation exists. Threshold ${RETRIEVAL_MIN_SCORE_value} sits in the gap.`);
    } else {
      console.log(
        `  ⚠️  Scores overlap. Consider adjusting threshold or reviewing chunking strategy.`
      );
    }
  }

  console.log("\n");

  if (passed < total) {
    process.exit(1);
  }
}

import { RETRIEVAL_MIN_SCORE as RETRIEVAL_MIN_SCORE_value } from "@/lib/config";

runTests().catch((err: unknown) => {
  console.error("\n❌ Test runner error:\n");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
