# Data Models

## Building JSON format

Buildings are registered via `POST /twin/register` or by uploading a JSON file in the 3D view.

```json
{
  "id": "building-a",
  "domains": ["university.edu", "engineering-dept"],
  "rooms": [
    {
      "id": "room-101",
      "capacity": 30,
      "maxTemperature": 28,
      "color": "#10b981",
      "position": { "x": 0, "y": 0, "z": 0 },
      "dimensions": { "width": 5, "height": 3, "depth": 4 }
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | ✓ | Application-level unique key — not a MongoDB ObjectId |
| `domains` | string[] | ✓ | Domain names this building belongs to |
| `rooms[].id` | string | ✓ | Room display name / number |
| `rooms[].capacity` | number | ✓ | Maximum occupants |
| `rooms[].position.y` | number | ✓ | Floor level — rooms sharing the same y are on the same floor |
| `rooms[].dimensions` | {width, height, depth} | ✓ | Arbitrary units — used by Three.js for box geometry |
| `rooms[].maxTemperature` | number | — | Alert threshold in °C (default 28 if omitted) |
| `rooms[].color` | string | — | Hex colour for RightMenu header and charts |

## Mutable vs immutable room fields

Only the following fields can be changed after upload (via `PATCH /twin/building/:bid/room/:rid`):

- `id` — rename the room
- `capacity`
- `maxTemperature`
- `color`

Position and dimensions are **immutable** after registration.

## Account schema

```typescript
interface IUser {
  username: string        // unique
  email: string           // unique
  password: string        // bcrypt hash — never returned by API
  memberships: IDomainMembership[]
}

interface IDomainMembership {
  domainName: string
  role: 'owner' | 'admin' | 'viewer'
  externalId?: string     // IdP subject claim — set by SSO flow
}
```

## Domain schema

```typescript
interface IDomain {
  name: string            // unique — acts as the primary key
  subdomains: string[]
  authStrategy: 'internal' | 'oidc'
  ssoConfig?: {
    issuerUrl: string
    clientId: string
    clientSecret: string  // select: false — never returned by default
  }
}
```

## Notification payload (Redis + Socket.IO)

```typescript
interface NotificationPayload {
  id: string              // Date.now().toString()
  message: string
  type: 'info' | 'alert' | 'critical'
  timestamp: Date
}
```