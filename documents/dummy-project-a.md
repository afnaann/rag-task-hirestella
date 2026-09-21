# Project: DocMind Enterprise Search

## Overview

DocMind is the flagship product Alex led at Luminary Labs. It is an enterprise-grade document intelligence and search platform that allows knowledge workers to query large internal document repositories using natural language. The system uses a Retrieval-Augmented Generation (RAG) architecture to ground responses in retrieved evidence, reducing hallucination risk compared to vanilla LLM applications.

DocMind entered private beta in March 2023 and reached general availability in November 2023. As of Q1 2024, it serves 14 enterprise clients across the legal, financial services, and healthcare sectors.

## Problem Statement

Enterprise document retrieval is hard. Traditional keyword search (BM25, Elasticsearch) fails when users ask conceptual questions that do not match document terminology exactly. Full-text LLM summarisation of entire document corpora is cost-prohibitive and creates unpredictable hallucination risks.

DocMind addresses this by:
1. Breaking documents into semantically coherent chunks
2. Embedding chunks using a dense vector model
3. Retrieving only the most relevant chunks at query time
4. Grounding LLM responses exclusively in retrieved evidence

## Alex's Role

Alex served as the technical lead for the DocMind project from conception through general availability. Responsibilities included:

- Designed the overall RAG architecture and chunking strategy
- Chose and evaluated embedding models (initially OpenAI text-embedding-ada-002, later migrated to a self-hosted model for cost and data sovereignty reasons)
- Built the retrieval API in Python (FastAPI) that is called by the front-end application
- Led a team of four engineers (two ML engineers, one backend engineer, one DevOps engineer)
- Collaborated with product management to define the evaluation framework and acceptance criteria
- Presented the architecture to enterprise customers during technical due diligence

## Technical Architecture

### Ingestion Pipeline

Documents (PDF, Word, plain text) are uploaded via a REST API. The ingestion pipeline:

1. Extracts raw text using Apache Tika (for PDFs) and python-docx (for Word files)
2. Applies document-type-specific cleaning: removes headers/footers, normalises whitespace, handles tables
3. Chunks text using a hierarchical strategy: section headings → paragraphs → sentence boundaries
4. Attaches metadata: document ID, source filename, upload timestamp, section heading, chunk index
5. Embeds each chunk using the configured embedding model
6. Upserts vectors into Pinecone with metadata filters

Ingestion throughput: approximately 2,000 document pages per minute on a 4-core worker.

### Query Pipeline

1. User query arrives at the FastAPI endpoint
2. Query is embedded using the same model as ingestion (critical for cosine similarity to work correctly)
3. Pinecone ANN search returns top-20 candidate chunks
4. A lightweight reranker (cross-encoder) reorders the 20 candidates and selects the top 5
5. The 5 chunks are assembled into a grounded context block
6. The context block plus user query are sent to the LLM with a strict grounding prompt
7. The response and the source chunk metadata are returned to the client

### Grounding Prompt Design

The system prompt explicitly instructs the model to:
- Answer only from the provided context
- Refuse to answer if the evidence is insufficient
- Cite the source document and chunk for every factual claim

This prompt design was the most important factor in reducing hallucination rates from approximately 18% (baseline zero-shot) to 2.3% (DocMind with grounding) as measured on the internal evaluation set.

### Evaluation Framework

Alex designed a 200-question evaluation set spanning:
- Answerable questions (150): questions with clear evidence in the corpus
- Unanswerable questions (30): questions with no evidence in the corpus
- Edge cases (20): partial evidence, ambiguous questions, multi-hop reasoning

Metrics tracked:
- Retrieval recall@5: 91%
- Hallucination rate: 2.3%
- Refusal rate on unanswerable questions: 87%
- Average end-to-end latency: 1.8 seconds (P50), 3.4 seconds (P95)

## Lessons Learned

**Chunking quality dominates retrieval quality.** Early prototypes used fixed-size chunking (512 tokens, no overlap). This produced poor retrieval because semantically coherent sections were split arbitrarily. Switching to a hierarchical, heading-aware chunker with 15% overlap improved retrieval recall@5 from 74% to 91%.

**Reranking is worth the latency cost.** Adding a cross-encoder reranker (adding ~200ms latency) improved precision from 71% to 88% on the internal evaluation set. For enterprise use cases where answer quality matters more than speed, this trade-off was well received by clients.

**Grounding prompt design is an engineering problem, not a magic trick.** The prompt went through 23 iterations before reaching acceptable hallucination rates. The most impactful change was adding a mandatory refusal clause with example refusal phrasing.

**Evaluation must precede deployment.** Two early enterprise pilots were paused when the evaluation framework revealed unacceptable hallucination rates on legal documents. The systematic evaluation approach avoided potentially damaging customer incidents.

## Technology Stack

- **Embedding model**: Initially OpenAI `text-embedding-ada-002`, later a self-hosted `bge-large-en-v1.5` model
- **Vector database**: Pinecone (managed)
- **Reranker**: `cross-encoder/ms-marco-MiniLM-L-12-v2` from Hugging Face
- **LLM**: GPT-4o (API)
- **API layer**: Python 3.11, FastAPI
- **Infrastructure**: AWS ECS (ingestion workers), AWS Lambda (query API), PostgreSQL (metadata)
- **Monitoring**: Prometheus, Grafana, custom eval dashboard built in Streamlit

## Impact

- 14 enterprise clients as of Q1 2024
- £2.1M ARR contribution attributed to the DocMind product line
- Reduced average document query resolution time from 4.2 minutes to 38 seconds at client sites
- Client NPS for DocMind: 71 (vs. industry benchmark of 32 for B2B SaaS)
