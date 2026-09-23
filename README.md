# RAG Portfolio — Afnan PK

A document-agnostic Retrieval-Augmented Generation (RAG) system and portfolio assistant built for the **HireStella AI Developer Assessment**.

The assistant answers questions about Afnan's experience, skills, and projects by retrieving relevant passages from his actual portfolio documents. It strictly avoids hallucinations and provides direct, concise answers with source citations. When evidence is absent, the system refuses cleanly rather than fabricating information.

---

## Architecture

```text
OFFLINE INGESTION (npm run ingest)
─────────────────────────────────────────────────────────────────────────────
documents/ (PDF + Markdown)
    → Document Loader (dynamic discovery, pdf-parse)
    → Heading-Aware Chunking (100–1500 chars, 200-char overlap)
    → Embedding Generation (gemini-embedding-2, 768d)
    → data/vector-store.json (persisted index, 42 chunks)

RUNTIME PIPELINE (POST /api/chat)
─────────────────────────────────────────────────────────────────────────────
User Message
    ↓
Query Embedding (gemini-embedding-2, 768d)
    ↓
Vector Cosine Similarity (scored against all 42 chunks in memory)
    ↓
Evidence Gate (calibrated threshold: 0.62)
    ├── No relevant evidence → Deterministic scope redirect (Refused = true, Provider = null, 0 LLM calls)
    └── Relevant evidence    → Grounded prompt synthesis
                                 ↓
                            Groq (Primary: openai/gpt-oss-120b)
                                 ↓ (on transient 429/5xx error)
                            Gemini (Fallback: gemini-3.6-flash)
                                 ↓
                            Structured JSON ({ answer, sources, grounded, refused, provider })
```

---

## Core Architecture Choices (In a Line Each)

* **Chunking**: Heading-aware hierarchical markdown splitting (100–1500 chars with 200-char overlap) preserving semantic section integrity rather than slicing blindly across token boundaries.
* **Embeddings**: `gemini-embedding-2` (768 dimensions via Google AI Studio free tier) providing high semantic density and MRL dimensional quality at zero cost.
* **Vector Store & Defense**: In-memory JSON vector store (`data/vector-store.json`) with vectorized cosine similarity. For a 42-chunk corpus (~180 KB), full retrieval completes in `<1ms` with zero database latency, zero connection pooling overhead, zero cold starts, and zero hosting cost. *(Note: In production multi-tenant environments, Afnan uses PostgreSQL + `pgvector` and Qdrant with tenant-level isolation, as implemented in Wiral AI).*
* **Primary LLM**: Groq `openai/gpt-oss-120b` for ultra-fast, low-latency third-person grounded responses under free-tier allowances.
* **Fallback LLM**: Gemini `gemini-3.6-flash` with automatic failover on Groq 429 rate limits or network hiccups so reviewers never experience a broken request.

---

## Portfolio Corpus

The corpus consists of four real documents covering Afnan's professional profile:

| Document | Format | Description |
|---|---|---|
| `AFNAN_PK_AI_ENGINEER.pdf` | PDF | Resume detailing work history, technical skills, education, and career summary. |
| `project-wiral-ai.md` | Markdown | Deep dive into the Wiral AI multi-agent customer engagement platform (LangGraph, hybrid RAG, Zoho CRM integration). |
| `project-etl-pipeline.md` | Markdown | Technical details of 50+ Apache Airflow ETL data pipelines, AWS S3/Redshift integration, and LLM-assisted cleaning. |
| `faq.md` | Markdown | Technical questions, preferred stack, personal preferences, and contact channels. |

---

## How to Run

### 1. Prerequisites & Environment Setup

Node.js 18+ and free-tier API keys:
* [Google AI Studio API Key](https://aistudio.google.com/apikey) (for embeddings & fallback generation)
* [Groq Cloud API Key](https://console.groq.com/keys) (for primary generation)

Create `.env.local` from the example:
```bash
cp .env.example .env.local
```
Add your keys to `.env.local`:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

### 2. Commands

```bash
npm install              # Install dependencies
npm run ingest           # (Optional) Rebuild vector store from documents/ (~10s)
npm run dev              # Start Next.js development server (http://localhost:3000)
npm run build            # Verify production build
```

### 3. Test Suites

```bash
npm run test:eval        # Run 10-case RAG regression evaluation suite (10/10 PASS)
npm run test:retrieval   # Run cosine similarity & evidence gate tests (11/11 PASS)
npm run test:chat        # Run end-to-end chat integration tests (8/8 PASS)
```

---

## Two-Layer Grounding & Refusal Architecture

A core design principle of this build is that **retrieval evidence and factual proof are not identical**. Biography-adjacent questions (e.g. *"Did Afnan work at Google?"*) achieve high similarity scores (~0.79) against career chunks even though Google employment is absent. 

The system handles this through two distinct guardrail layers:

1. **Layer 1 — Deterministic Retrieval Gate**:
   * Evaluated before any LLM is invoked.
   * Completely off-domain queries (*"How do I bake sourdough?"*) and greetings (*"Hi"*) score below `RETRIEVAL_MIN_SCORE = 0.62`.
   * Immediately returns a deterministic scope redirect with `refused: true`, `provider: null`, and 0 sources at **zero LLM cost**.
2. **Layer 2 — Strict Prompt Grounding**:
   * When chunks pass the evidence gate, the grounded prompt requires direct affirmative answers for supported facts and concise, direct negatives (*"No. Afnan did not work at Google."*) for unsupported claims.
   * Eliminates defensive meta-explanations (*"According to the documents..."*, *"I don't have information..."*) and strictly forbids fabricating unstated preferences (e.g., refuses to assume Python is a favorite language simply because it appears on the CV).

---

## Regression Evaluation Suite (`npm run test:eval`)

The assessment requests a small evaluation set of ~10 questions with expected answers and a scoring script to detect regressions:

* **Dataset**: `eval/questions.json`
* **Test Harness**: `scripts/test-eval.ts`
* **Scoring Methodology**: Deterministic checks covering behavioral mode (`direct_positive`, `direct_negative`, `mixed`, `deterministic_scope`), required fact groups via semantic aliases, third-person perspective, and zero forbidden leakage (no mentions of "Source 1", "provided context", etc.).

| ID | Case | Category | Key Verification | Result |
|---|---|---|---|:---:|
| `E01` | MCP Experience | Supported Skill | Direct affirmative ("Yes"), mentions MCP | **PASS** |
| `E02` | RAG Experience | Supported Experience | Direct affirmative ("Yes"), cites Qdrant / vector pipelines | **PASS** |
| `E03` | LangGraph Platform | Supported Project | Mentions multi-agent customer platform / graph routing | **PASS** |
| `E04` | Airflow ETL Pipelines | Supported Data Eng | Mentions 50+ ETL pipelines, Redshift / S3 integration | **PASS** |
| `E05` | Canva Experience | Direct Negative | Direct negative ("No"), confirms no Canva experience | **PASS** |
| `E06` | Google Employment | Direct Negative | Direct negative ("No"), confirms no Google tenure | **PASS** |
| `E07` | Favorite Language Trap | Hallucination Trap | Identifies undocumented preference, does not invent | **PASS** |
| `E08` | Python + Canva | Mixed Query | Independently affirms Python and negates Canva | **PASS** |
| `E09` | Sourdough Baking | Off-Domain | Retrieval gate fires deterministically (0 LLM calls) | **PASS** |
| `E10` | Greeting ("Hi") | Scope Redirect | Enters no-evidence gate naturally without regex | **PASS** |

**Current Score**: 10/10 cases passed (100/100).

---

## What's Broken, Unfinished, or Intentionally Left Out

As requested by the assessment brief, here is a transparent accounting of what was intentionally omitted due to the 8–10 hour time budget and what would be implemented next:

1. **Query Rewriting & Expansion**: Raw user queries are currently embedded directly as submitted. Terse, conversational, or colloquial queries (e.g. *"what did he do at wiral?"* or ambiguous acronyms) benefit significantly from an upstream query rewriting / HyDE (Hypothetical Document Embeddings) step that expands the user query into semantically rich search terms before vector comparison.
2. **Second-Stage Cross-Encoder Reranking**: Vector cosine similarity (bi-encoder) measures global proximity in embedding space, but high semantic similarity does not always equate to exact contextual relevance for answering a specific question. In a production pipeline, passing the top candidates through a cross-encoder reranker (e.g., Cohere Rerank or BGE-Reranker) before prompt injection would filter out topically similar but non-answering chunks.
3. **LLM-as-a-Judge Evaluation Pipeline**: The current evaluation harness (`scripts/test-eval.ts`) evaluates regression using deterministic assertion checks, fact-group presence, and regex guardrails. While fast, zero-cost, and completely repeatable, incorporating an automated LLM-as-a-Judge framework (e.g., Ragas, DeepEval, or G-Eval) to score context faithfulness, answer relevance, and hallucination metrics would provide deeper qualitative scoring across larger datasets.
4. **Multi-Turn Conversational Memory**: Each query is currently processed as an independent single-turn interaction. Conversational session history, state persistence, and follow-up coreference resolution (e.g., *"What else did he build there?"* → *"What else did Afnan build at Wiral AI?"*) were omitted to evaluate raw retrieval and grounding accuracy without multi-turn conversational drift.
5. **Token Streaming**: The API returns structured batch JSON (`{ answer, sources, grounded, refused, provider }`). Token streaming via `ReadableStream` / Server-Sent Events (SSE) was omitted to keep citation attribution, latency telemetry, and automated evaluation parsing clean and deterministic within the assessment time budget.
6. **Incremental Ingestion & Token-Precise Chunking**: Ingestion (`npm run ingest`) performs a full clean rebuild of `data/vector-store.json` using character length approximations (~4 chars/token). A larger enterprise setup would utilize SHA-256 document change detection and native BPE tokenizers (e.g. `tiktoken`).
