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
