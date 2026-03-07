// client/src/services/api.ts

/**
 * API Service with JWT Authentication
 *
 * This service handles:
 * - Automatic token attachment to requests
 * - Automatic token refresh when expired
 * - Logout on refresh failure
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost';

/**
 * Make an authenticated API request
 * Automatically adds JWT token and handles token refresh
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('accessToken');

  // First attempt with current token
  let response = await fetch(`${SERVER_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
  });

  // If unauthorized or forbidden, try refreshing token
  if (response.status === 401 || response.status === 403) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      // Retry request with new token
      response = await fetch(`${SERVER_URL}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json',
        },
      });
    } else {
      // Refresh failed - redirect to login
      handleLogout();
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    console.warn('No refresh token available');
    return null;
  }

  try {
    const response = await fetch(`${SERVER_URL}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();

      // Store new tokens
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      return data.accessToken;
    } else {
      console.error('Token refresh failed:', response.status);
      return null;
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Handle logout - clear tokens and redirect
 */
function handleLogout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('username');
  localStorage.removeItem('isAuthenticated');

  // Redirect to home page
  window.location.href = '/';
}

/**
 * Login with username/password
 */
export async function login(username: string, password: string) {
  const response = await fetch(`${SERVER_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();

  // Store tokens and user info
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('username', data.user.username);
  localStorage.setItem('isAuthenticated', 'true');

  return data;
}

/**
 * Register new user
 */
export async function register(username: string, email: string, password: string) {
  const response = await fetch(`${SERVER_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Registration failed');
  }

  const data = await response.json();

  // Store tokens and user info
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('username', data.user.username);
  localStorage.setItem('isAuthenticated', 'true');

  return data;
}

/**
 * Logout user
 */
export function logout() {
  handleLogout();
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const token = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  return !!(token && refreshToken);
}

/**
 * Get current user from token (client-side decode)
 * Note: This is NOT secure validation, only for UI purposes
 */
export function getCurrentUser(): { username: string } | null {
  const username = localStorage.getItem('username');
  return username ? { username } : null;
}
