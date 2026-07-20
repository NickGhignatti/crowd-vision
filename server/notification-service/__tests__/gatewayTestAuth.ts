// Builds the base64 x-gateway-claims header the Istio ingress injects after verifying the
// gateway JWT, for tests that need an authenticated request without exercising edge
// verification (done once at ingress — see k8s/istio-request-authentication.yml).
import type request from "supertest";

export function claimsHeaderFor(accountName: string): string {
  return Buffer.from(
    JSON.stringify({ sub: `u-${accountName}`, accountName, memberships: [] }),
  ).toString("base64");
}

// Sets the mesh-injected claims header the auth middleware reads; the account is bound from
// this header, never from the request body or URL.
export const auth = <T extends request.Test>(req: T, account = "alice"): T =>
  req.set("x-gateway-claims", claimsHeaderFor(account)) as T;
