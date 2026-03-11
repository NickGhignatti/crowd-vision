# Design Decisions

## Microservices and database isolation

Each service owns its MongoDB instance. This prevents schema coupling, allows independent scaling, and means a slow twin query can never block authentication.

## Redis pub/sub for real-time events

Rather than polling or direct service-to-service HTTP calls, the notification pipeline uses Redis as a message broker. This decouples producers (`notification-service`) from consumers (`socket-service`) and makes it trivial to add more consumers in the future (e.g. an LLM service reacting to crowd events).

## Stateless JWT authentication

JWTs are self-contained and verified by the `requireAuth` middleware without a database round-trip. The 3-hour expiry balances session security with user convenience. Device tokens (for IoT sensors) have a 5-year expiry.

## SSO / OIDC with PKCE (stateless state)

The SSO flow uses PKCE (`code_challenge_method: S256`) and encodes the PKCE verifier + username + domain name in the OAuth `state` parameter as a base64 JSON blob. This avoids the need for a server-side session store during development.

!!! warning "Production note"
Store the PKCE verifier in Redis keyed by a random opaque token for production. The base64 approach is vulnerable to state-tampering.

## Domain membership as embedded subdocument

User memberships are embedded in the User document as an array rather than a separate collection. This simplifies queries (a single `User.findOne` returns everything) at the cost of some update complexity for membership changes. Given the expected low cardinality of memberships per user, this is the right trade-off.

## Vue Composition API with composables (no global store)

Instead of Pinia or Vuex, reactive state is co-located in `src/composables/`. `socketState` in `socket.ts` is a module-level reactive object, effectively a lightweight global store for notification state. This keeps the bundle small and avoids boilerplate.

## Sensor simulation

Sensors are simulated using the Socket.IO protocol. Each simulated client identifies its room via the `id` field in the JSON payload. The many-to-one multiplexing pattern (many sensor clients → one Socket.IO server) mirrors how a real IoT deployment would work.

## Domains system

The Domain system adds a multi-tenant layer. Buildings are scoped to one or more domain name strings. A user's access to buildings is computed by fetching their memberships, then querying `/twin/buildings/:domainName` for each. This means a single user can belong to multiple organisations and see all their buildings in one view.