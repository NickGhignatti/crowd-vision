# Domain Management

> **New in v2.0.0**
> CrowdVision now supports **Multi-Domain Management**, allowing you to switch between different organizations with a single account.

## Overview

A **Domain** represents a distinct organization or environment. Users can:
1. **Create** new domains (if authorized).
2. **Subscribe** to public domains to access their buildings and sensors.
3. **Switch** between domains to view specific digital twins.

---

## 🖥️ Managing Domains

Navigate to the **Domain Management** page via the dashboard. Here you can search for organizations and manage your memberships.

### Creating a New Domain
Click the **+ Add** button to open the creation wizard.

1. **Main Domain**: Enter the unique identifier (e.g., `university.edu`).
2. **Authentication Strategy**:
    * **Standard**: Users join freely or by invitation. Managed entirely by CrowdVision.
    * **External SSO (OIDC)**: Connects to an external Identity Provider (like Keycloak, Auth0, or Google). Users must authenticate via that provider to join.
3. **Subdomains**: (Optional) Add related sub-organizations (e.g., `engineering.university.edu`).

### Subscribing & Unsubscribing
The list displays all available domains.

* **Subscribe**: Click to join.
    * *For Standard Domains*: You join immediately as a "Viewer".
    * *For SSO Domains*: You will be redirected to the external login page to verify your identity.
* **Unsubscribe**: Click "Leave" to remove the domain from your profile.

---

## 🔐 Private Domains
*(Coming Soon)*
Private domains allow for invite-only access. Currently, the "Private" button is a placeholder for future functionality.
