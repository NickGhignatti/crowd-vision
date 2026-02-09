# Design

## Sensors simulation

This project implements a scalable architecture for simulating an IoT sensor network.

The solution utilizes Node.js scripts integrated with Faker.js to generate stochastic, realistic environmental data. 
Data transmission is handled via WebSockets (Socket.io), replacing traditional HTTP polling with an event-driven "push" 
mechanism. The architecture employs a many-to-one multiplexing pattern, where multiple autonomous simulated clients—representing
distinct classrooms—transmit data asynchronously to a centralized Express.js backend through a shared socket channel.

Identification of individual sensors is managed via unique IDs embedded within the JSON payload.

## Data exchange

Between the Vue.js client and the Express server there would be open a websocket where processed data from the server are 
pushed towards the client. 
1. **Sensor -> Server**: Simulated sensors push telemetry data (updates on people count, temperature) to the **Socket Service**.
2. **Server -> Client**: The Socket Service broadcasts these updates to connected Vue.js clients subscribed to the specific room or building topics.
3. **Alerts**: If data thresholds are breached (e.g., temperature > maxTemperature), events are published to Redis. The **Notification Service** consumes these events and triggers Push Notifications to relevant users.

## Domains

The **Domain System** introduces a multi-tenant layer to `auth-service`. It decouples the "User" from a single entity, allowing many-to-many relationships via **Memberships**.

### 1. Data Model

#### Domain Schema
The `Domain` entity defines the configuration for an organization.
* **`name`**: Unique identifier (Primary Key logic).
* **`authStrategy`**: Determines how users access the domain.
    * `internal`: Standard CrowdVision auth.
    * `oidc`: OpenID Connect for external integration.
* **`ssoConfig`**: (Encrypted) Stores `clientId`, `clientSecret`, and `issuerUrl` for SSO domains.

```typescript
// Schema Reference
export interface IDomain {
  name: string;
  subdomains: string[];
  authStrategy: "internal" | "oidc";
  ssoConfig?: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  };
}
```

#### User Membership
Users are not "in" a domain; they have memberships. This allows a single user to be an Admin in `Domain A` and a Viewer in `Domain B`.

```typescript
export interface IDomainMembership {
  domainName: string;
  role: "owner" | "admin" | "viewer";
}
```


### 2. Authentication Workflow

#### Authentication Flows
*Standard Flow (Internal)*
- User clicks "Subscribe".
- Client calls `POST /subscribe`.
- Backend verifies domain exists and adds a viewer membership to the user document.

*SSO Flow (OIDC)*
- User clicks "Subscribe".
- Client detects `authStrategy === 'oidc'`.
- Client requests a redirect URL via `/auth/sso/login`.
- User authenticates with the external Identity Provider (IdP).
- IdP calls back to `auth-service`, which validates the token and adds the membership.
