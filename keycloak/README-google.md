# "Continue with Google" — setup

The login/register modals show a **Continue with Google** button. It sends the
browser to Keycloak with `kc_idp_hint=google`, which brokers the login through
Google. The button is wired end-to-end already; it only needs Google OAuth
credentials to actually work (Keycloak brokers the account — no code change).

## One-time Google Cloud setup

1. Go to <https://console.cloud.google.com/apis/credentials> → **Create
   credentials** → **OAuth client ID** → application type **Web application**.
2. Add this **Authorized redirect URI** (must match the realm alias `google`):

   ```
   http://localhost:8090/realms/crowdvision/broker/google/endpoint
   ```

   For a deployed environment, swap `http://localhost:8090` for the public
   Keycloak URL (`KEYCLOAK_PUBLIC_URL`).
3. Copy the generated **Client ID** and **Client secret**.

## Wire the credentials

Paste them into `.env` (the keys are pre-seeded, empty, by
`scripts/env/keycloak.js`):

```
GOOGLE_CLIENT_ID=<your client id>
GOOGLE_CLIENT_SECRET=<your client secret>
```

Docker Compose passes both into the Keycloak container, and the realm import
substitutes them into the `google` identity provider via
`${GOOGLE_CLIENT_ID}` / `${GOOGLE_CLIENT_SECRET}` placeholders. Substitution is
enabled by `-Dkeycloak.migration.replace-placeholders=true` (set in
`docker-compose.yml` via `JAVA_OPTS_APPEND`).

## Apply

The realm is imported **only on first boot** (empty Keycloak DB). If Keycloak
has already started once, either:

- **Fresh import:** `just stack down` then remove the Keycloak DB volume so the
  realm re-imports with the new credentials, **or**
- **Live edit:** log into the Keycloak admin console
  (<http://localhost:8090>, `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`)
  → realm `crowdvision` → **Identity providers** → **google** → paste the
  Client ID / secret there.

Left unconfigured, the button still renders but the Google step will fail —
that's expected until the credentials are set.
