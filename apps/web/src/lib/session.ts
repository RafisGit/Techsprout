/**
 * TechSprout Client Session Management Helper
 *
 * Coordinates post-login redirection and session termination under the
 * secure Next.js Backend-for-Frontend (BFF) architecture.
 *
 * Authentication cookies are strictly HttpOnly, SameSite=Lax, and Secure,
 * managed entirely by the server boundary (/api/v1/* BFF proxy route handler).
 */

export const SESSION_COOKIE_NAME = 'techsprout_session';

/**
 * Resolves post-login redirection URL based on user role.
 */
export function getPostLoginRedirect(role?: string): string {
  if (role === 'admin') {
    return '/dashboard/admin/overview';
  }
  if (role === 'instructor') {
    return '/instructor/dashboard';
  }
  return '/dashboard';
}

/**
 * Signs out the current user by calling the BFF logout endpoint,
 * which invalidates the session token in the database, expires the
 * HttpOnly session cookie via Set-Cookie headers, and redirects to /login.
 */
export async function logoutUser(): Promise<void> {
  try {
    const { axiosInstance } = await import('./axiosInstance');
    await axiosInstance.post('/api/v1/auth/logout');
  } catch {
    // Ignore backend failure so client navigation proceeds
  } finally {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}

/**
 * Legacy compatibility shims (deprecated under BFF architecture).
 * Authentication cookies are now managed exclusively via HttpOnly server cookies.
 */
export function setSessionCookie(_token: string): void {
  // No-op: Authentication cookies are set exclusively as HttpOnly headers by the BFF proxy
}

export function clearSessionCookie(): void {
  // No-op: Authentication cookies are cleared via Set-Cookie headers on /api/v1/auth/logout
}

export function getSessionToken(): string | null {
  // Return null: Raw tokens are inaccessible to client-side JavaScript for XSS defense
  return null;
}
