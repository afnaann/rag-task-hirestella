# Wiral AI — Multi-Agent Customer Engagement Platform

## Overview

Wiral is a production multi-tenant AI customer engagement platform that I architected and built as the sole AI/LangGraph engineer. The platform processes approximately 400–600 daily customer interactions across WhatsApp, email, web chat, and voice channels.

Built on top of Chatwoot (an open-source customer support platform), Wiral intercepts incoming customer messages, processes them through a multi-agent AI pipeline, and handles enquiries, appointment booking, CRM data capture, and human escalation — all autonomously.

The primary use case is real estate in the Gulf region (UAE/Qatar), specifically handling inbound leads from Property Finder.

## Architecture

### Multi-Agent Orchestration with LangGraph

I redesigned the existing single-agent architecture into a LangGraph-based multi-agent system with three dedicated agents:

- **Enquiry Agent** — The customer-facing AI. Handles knowledge-base lookups, product/property questions, and general customer support using RAG retrieval.
- **Booking Agent** — Manages calendar availability checks, appointment scheduling, and cancellations via Google Calendar integration. Activated through a handoff mechanism when the Enquiry Agent detects a booking intent.
- **Back Office Agent** — Runs silently after every customer response. Extracts structured data from the conversation (customer intent, budget, timeline, contact details) and writes it back to the CRM. The customer never sees this agent's output.

The graph flow:

```
Validation → Memory Sync → Enquiry Agent → Send Response → Back Office Agent
                                ↓ (if booking intent)
                           Booking Agent → Send Response → Back Office Agent
```

This separation reduced user-facing response latency by approximately 30% by moving non-critical post-response workloads into asynchronous back-office processing.

### Asynchronous Processing with BullMQ and Redis

The system decouples HTTP webhook handling from AI processing:

- The Express API server receives Chatwoot webhooks and enqueues them into a BullMQ queue (backed by Redis). The HTTP response returns immediately (202 Accepted).
- A separate BullMQ worker process consumes jobs and runs the LangGraph pipeline.
- Job IDs are deterministic per message (`webhook-{accountId}-{convId}-msg-{messageId}`), providing automatic deduplication if Chatwoot fires duplicate webhooks.

### Redis Distributed Locking

I implemented Redis-based distributed locking to prevent concurrent processing of messages from the same conversation. Without this, two parallel messages would read the same LangGraph checkpoint, produce conflicting states, and corrupt the conversation history.

- Lock key: `webhook:conversation:lock:{accountId}:{conversationId}`
- Lock TTL: 120 seconds with automatic renewal every ~40 seconds
- Acquire uses `SET ... NX PX` (atomic, only if not exists)
- Release uses a Lua script to check ownership before deleting (prevents releasing another job's lock)

### RAG with Hybrid Retrieval (Qdrant)

I engineered the RAG pipeline for knowledge-base ingestion and web content extraction:

- Documents are uploaded, chunked (RecursiveCharacterTextSplitter, 1000 chars, 200 overlap), and embedded using OpenAI `text-embedding-3-small` (1536 dimensions).
- Vectors are stored in Qdrant with tenant-scoped payload filtering — each client's data is isolated by `account_id` in a shared collection.
- Retrieval uses hybrid search: 50/50 mix of dense vector similarity and sparse BM25-style keyword matching. This handles both semantic queries ("what are your pricing options") and exact-match queries ("AX-2000 specifications").
- The Enquiry Agent decides autonomously when to call the `search_knowledge_base` tool and what query to use.

### MCP Integration with Zoho CRM

I integrated MCP (Model Context Protocol) with Zoho CRM to enable AI workflows to retrieve and manage lead information directly. The integration includes human-in-the-loop escalation for complex conversations requiring manual intervention — the system tags conversations with "helpme" to route them to human agents while optionally continuing silent back-office data capture.

## Key Engineering Decisions

### Semantic Caching

I implemented a semantic cache in Qdrant that sits between the Enquiry Agent and the LLM. Near-duplicate customer questions are answered from cache without calling the LLM:

- Cache lookup embeds the normalised query and searches for semantically similar cached entries (cosine similarity threshold: 0.9).
- Cached responses are stored as templates with context placeholders (`{CTX_CUSTOMER_NAME}`, `{CTX_PHONE}`, etc.) and re-hydrated with the current customer's data on cache hit.
- Write policy excludes responses involving real-time tools (calendar, calculator, file operations) to prevent serving stale results.
- Prompt version invalidation: when a client's system prompt is updated, all cached entries for that prompt version are purged.

This reduced measured LLM costs by 40–50%.

### Multi-Tenant Data Isolation

The platform serves multiple clients from a single deployment. Tenant isolation:

| Data Type | Isolation Mechanism |
|---|---|
| Client configuration | PostgreSQL `WHERE account_id = ?` |
| Knowledge base chunks | Qdrant payload filter `{ accountId: N }` |
| Semantic cache | Qdrant payload filter `{ accountId: N, agent: "enquiry" }` |
| LangGraph checkpoints | Thread ID includes `accountId` |
| Conversation locks | Redis key includes `accountId` |

### Back Office Loop Prevention

The Back Office Agent runs on every turn and needed multiple guard rails to prevent infinite processing loops:

- Duplicate turn signature detection (hashes message + response, compares to previous)
- Tool result echo detection (avoids treating tool confirmation messages as new input)
- Attribute unchanged detection (skips if all extracted attributes match current values)

These were iteratively developed from real production incidents.

### Cost-Aware Model Routing

Different agents use different models based on cost/quality trade-offs:

- Enquiry Agent: GPT-4o (higher quality for customer-facing responses)
- Back Office Agent: GPT-4o-mini (lower cost for internal data extraction)
- Per-client model overrides stored in PostgreSQL

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Web Framework | Express 5 |
| AI Orchestration | LangGraph (`@langchain/langgraph`) |
| LLM | OpenAI (GPT-4o / GPT-4o-mini, per-client configurable) |
| Queue | BullMQ + Redis |
| Vector DB | Qdrant (RAG + semantic cache) |
| Primary DB | MongoDB / Mongoose |
| Relational DB | PostgreSQL / Sequelize |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Observability | Langfuse + OpenTelemetry |
| Deployment | Azure VMs, Docker, PM2 |
| Voice | Retell AI (Custom LLM WebSocket API) |

## Production Impact

- ~400–600 daily customer interactions across sales and support workflows
- ~30% reduction in user-facing response latency through async back-office processing
- ~40–50% reduction in LLM costs through semantic caching and cost-aware model routing
- Multi-channel support: WhatsApp, email, web chat, and voice
- Deployed across development, UAT, and production environments on Azure
