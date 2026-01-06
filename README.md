# Cedar TPE RAG Authorization Demo

This repository demonstrates a concrete pattern for building **authorization-scoped retrieval** in a RAG system:

1. **Cedar type-aware partial evaluation (TPE)** is used to evaluate policies with a known principal, action, and context, but an unknown resource.
2. Cedar produces a **residual policy** describing which resource attributes and relationships still matter for access.
3. The application **translates that residual into retrieval constraints** (a metadata filter).
4. Vector search runs **with those constraints applied**, so only authorized chunks can become LLM context.

This is not “policy in the prompt.”  
Authorization is enforced *before* any sensitive context is assembled.

---

## What this repo is (and isn’t)

**This repo is:**
- A hands-on demo of policy-driven retrieval in a RAG pipeline
- An example of using Cedar TPE outputs to constrain vector search
- A minimal multi-tenant collaboration dataset (companies, users, shared documents)

**This repo is not:**
- A full RAG application or UI
- An agentic system
- A production reference architecture

The goal is to make one architectural boundary concrete:

> **The model never sees unauthorized data because the system never retrieves it.**

---

## Architecture at a glance

A simplified flow:

1. A person asks a question in an application.
2. The application (acting as PEP) evaluates authorization using Cedar.
3. Cedar runs **partial evaluation** with an abstract resource.
4. Cedar returns a **residual condition** over resource attributes.
5. The application compiles that residual into a **vector DB filter**.
6. Vector search runs with the filter applied.
7. Only authorized chunks are assembled as context for the model.

---

## Repository layout

- `cedar/` — Cedar schema, policies, and entities
- `data/` — demo documents and chunk metadata
- `src/tpe/` — Node scripts to run Cedar partial evaluation
- `src/compile/` — residual → datastore filter translation
- `src/ingest/` — embedding and OpenSearch ingest
- `src/retrieve/` — filtered vector queries and context assembly
- `examples/` — sample requests, residuals, and queries
- `infra/` — optional AWS OpenSearch Serverless setup
- `ai/` — Cursor prompts and AI-assisted workflows

---

## Prerequisites

- Node.js 18+
- npm or pnpm
- Cedar CLI or JS evaluator available locally
- Optional: AWS account for OpenSearch Serverless

---

## Step 1: Inspect the policy model

Start by reviewing:

- `cedar/schema.cedarschema`
- `cedar/policies/`
- `cedar/entities.json`

The policies model a multi-tenant collaboration platform where access depends on:
- tenant membership
- team-based sharing
- document classification

---

## Step 2: Run partial evaluation (emit a residual)

Example (illustrative command):

```bash
node src/tpe/partial-eval.js \
  --principal 'Customer::"kate"' \
  --action 'Action::"ask"' \
  --context examples/requests/context-tenant-a.json \
  --resource-type Chunk \
  --out out/residual-kate.json

This runs Cedar with:
- a known principal and action
- known runtime context
- an abstract resource

The output is a residual policy describing what must be true about a Chunk
for access to be permitted.

## Step 3: Compile the residual into a retrieval filter
This step is *application logic,* not Cedar logic.

Cedar does not generate database queries.
It tells you which attributes and relationships still matter.

## Step 4 (optional): Index and query OpenSearch Serverless

This repo can optionally demonstrate enforcement using a real vector database.

High-level flow:
1. Create an OpenSearch Serverless collection and index (see infra/)
2.	Embed and ingest chunks with metadata (see src/ingest/)
3.	Run a k-NN query with the compiled filter applied (see src/retrieve/)

Example query shape:
- vector similarity clause
- metadata filter derived from Cedar residual

## Key correctness guarantees

This demo is intentionally strict about boundaries:
- Cedar decides authority.
- The application enforces scope.
- Retrieval is constrained before context exists.
- Prompts express intent, not access control.

The residual-to-filter translation is explicit so it can be audited, tested, and reasoned about.

## Status

Current focus:
- ✅ Policy model for a multi-tenant collaboration platform
- ✅ Sample requests and expected access outcomes
- ⏳ Cedar TPE invocation via Node
- ⏳ Residual → OpenSearch filter compilation
- ⏳ OpenSearch Serverless ingest + filtered retrieval
- ⏳ End-to-end “authorized context” output
