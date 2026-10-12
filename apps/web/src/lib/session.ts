/**
 * TechSprout Client Session Management Helper
 *
 * Manages the `techsprout_session` cookie on the frontend domain to allow
 * Next.js Server Components and layout guards to read session identity across
 * cross-origin deployments (e.g., Vercel frontend + Render backend API).
 */

export const SESSION_COOKIE_NAME = 'techsprout_session';

/**
 * Sets the session cookie on the current frontend domain.
 * Configured with 30-day lifetime, Path=/, SameSite=Lax, and Secure on HTTPS.
 */
export function setSessionCookie(token: string, maxAgeSeconds: number = 30 * 24 * 60 * 60): void {
  if (typeof document === 'undefined') return;

  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'path=/',
    `max-age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];

  if (isSecure) {
    cookieParts.push('Secure');
  }

  document.cookie = cookieParts.join('; ');
}

/**
 * Clears the session cookie from the current frontend domain.
 */
export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;

  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    'path=/',
    'expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ];

  if (isSecure) {
    cookieParts.push('Secure');
  }

  document.cookie = cookieParts.join('; ');
}

/**
 * Extracts the active session token from document.cookie if available.
 */
export function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

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
 * Signs out the current user by calling the API logout endpoint,
 * clearing the frontend session cookie, and redirecting to /login.
 */
export async function logoutUser(): Promise<void> {
  try {
    const { axiosInstance } = await import('./axiosInstance');
    await axiosInstance.post('/api/v1/auth/logout');
  } catch {
    // Ignore backend failure so client session is always cleaned up
  } finally {
    clearSessionCookie();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}
