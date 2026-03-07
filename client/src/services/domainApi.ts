import { authenticatedFetch } from "./authenticationApi";

/**
 * Example: Fetch all domains (protected endpoint)
 */
export async function fetchDomains() {
  const response = await authenticatedFetch('/domains');

  if (!response.ok) {
    throw new Error('Failed to fetch domains');
  }

  return response.json();
}

/**
 * Example: Subscribe to a domain (protected endpoint)
 */
export async function subscribeToDomain(username: string, domainName: string) {
  const response = await authenticatedFetch(`/domains/${username}/subscribe`, {
    method: 'POST',
    body: JSON.stringify({ domainName }),
  });

  if (!response.ok) {
    throw new Error('Failed to subscribe to domain');
  }

  return response.json();
}

/**
 * Extract tokens from SSO callback URL
 * Called when user returns from external IdP
 */
export function extractSSOTokens() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokensParam = urlParams.get('tokens');

  if (tokensParam) {
    try {
      const tokens = JSON.parse(atob(tokensParam));

      // Store tokens
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      localStorage.setItem('isAuthenticated', 'true');

      // Clean URL (remove tokens from URL)
      window.history.replaceState({}, '', window.location.pathname);

      return true;
    } catch (error) {
      console.error('Failed to parse SSO tokens:', error);
      return false;
    }
  }

  return false;
}
