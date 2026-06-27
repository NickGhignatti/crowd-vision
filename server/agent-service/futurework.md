# Agent Service Future Work

## Move live-data authorization into downstream services

The agent tools now authorize requested domains and building IDs against `ToolContext.user`
before returning Twin or Sensor data to the model. Twin Service and Sensor Service still expose
their internal endpoints without caller authentication, so this is an agent-side boundary rather
than defense in depth.

When cross-service authentication is available, retain the agent checks and also forward a
short-lived caller or service token to protected downstream endpoints.

Acceptance criteria:

- Twin Service and Sensor Service reject unauthenticated direct requests.
- Both services enforce the same domain/building scope as the agent.
- Direct-ID requests do not reveal whether an inaccessible building or room exists.
- Integration tests cover mismatched, expired, and service-to-service credentials.

## Build a trusted knowledge-base ingestion lifecycle

The current ingestion path has three related weaknesses:

- `/ingest` requires authentication but does not require an administrator role or dedicated
  service identity.
- Documents are deduplicated only by global content hash. Updating a source creates a new
  document while leaving its previous chunks searchable, and removed sources are not deleted.
- The repository `agent-ingester` loads both user and developer documentation, exposing internal
  implementation material to the assistant knowledge base.

Treat ingestion as a privileged, testable document-lifecycle operation rather than a generic
authenticated endpoint:

- Restrict `/ingest` to an administrator role or dedicated ingester service credential.
- Make the repository `agent-ingester` ingest only `documentation/user`.
- Upsert transactionally by stable source: replace the source's old document and chunks when its
  content changes.
- Delete indexed sources that no longer exist in the configured ingestion corpus.
- Preserve content-hash skipping for unchanged sources to avoid unnecessary embedding calls.
- Add a scripted fake `LLMClient` and restore end-to-end agent-loop integration coverage for
  ingestion, retrieval, tool dispatch, invalid arguments, tool failures and recovery, multiple
  hops, loop exhaustion, and hallucinated citations.

Acceptance criteria:

- Ordinary authenticated users cannot ingest or replace documents.
- The automated ingester indexes only user-facing documentation.
- Updating or deleting a source cannot leave stale searchable chunks behind.
- A failed replacement rolls back without losing the previously indexed source.
- Integration tests run without a real model provider and cover the full ingest-to-answer path.

## Harden untrusted model inputs and upstream reliability

Retrieved documents and downstream tool responses are untrusted data inserted into the model
conversation. A malicious document or compromised service can return instruction-like text,
while transient provider and twin-service failures can currently cause avoidable request
failures or inconsistent behavior.

Harden the agent boundary and execution path:

- Add adversarial evaluations containing prompt-injection instructions in documents and tool
  responses.
- Extend the existing bounded GET retries with an overall per-answer deadline.
- Return structured decisions/errors that distinguish timeout, upstream failure, refusal, IDK,
  and tool-loop exhaustion.

Acceptance criteria:

- Indirect prompt-injection evals cannot override scope, authorization, or tool constraints.
- Retries are bounded, observable, and never duplicate write operations.
- HTTP connection pools are reused and closed during application shutdown.
- Clients and evals can distinguish expected refusals/IDK from infrastructure failures.
