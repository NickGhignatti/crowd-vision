# Agent Service Future Work

## Enforce caller authorization in twin tools

The current `list_buildings`, `get_building`, `list_rooms`, and `get_room` tools call
`twin-service` without forwarding the caller JWT and without authorizing against
`ToolContext.user`. The model is prompted to use the caller's domains, but prompt guidance is
not an authorization boundary.

Before treating live building and room data as tenant-isolated, implement one of these designs:

- Forward the caller's signed JWT to protected twin-service endpoints and let twin-service
  enforce access.
- Enforce access inside each tool using `ctx.user`, backed by trusted ownership/domain data.

Acceptance criteria:

- A caller cannot list or fetch buildings and rooms outside their authorized domains.
- Direct-ID tools reject inaccessible building and room IDs without revealing their existence.
- Authorization is enforced before live data is returned to the model.
- Unit and integration tests cover allowed access, cross-domain denial, guessed IDs, and missing
  or invalid identity.
- Tool traces and errors do not expose unauthorized live data.

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

- Explicitly instruct the model that retrieved documents and tool results are data, never
  instructions, and cannot override the system prompt or caller authorization.
- Keep tool responses structured and minimized; sanitize fields that are not needed by the
  model.
- Add adversarial evaluations containing prompt-injection instructions in documents and tool
  responses.
- Reuse long-lived HTTP clients instead of creating a new client for every twin-service call.
- Add bounded retries with backoff only for safe transient failures, respecting the overall
  request deadline.
- Return structured decisions/errors that distinguish timeout, upstream failure, refusal, IDK,
  and tool-loop exhaustion.

Acceptance criteria:

- Indirect prompt-injection evals cannot override scope, authorization, or tool constraints.
- Retries are bounded, observable, and never duplicate write operations.
- HTTP connection pools are reused and closed during application shutdown.
- Clients and evals can distinguish expected refusals/IDK from infrastructure failures.
