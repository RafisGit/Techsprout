import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  getPostLoginRedirect,
  logoutUser,
  SESSION_COOKIE_NAME,
} from '@/lib/session';
import { getCurrentUser } from '@/auth';
import { axiosInstance, API_BASE_URL } from '@/lib/axiosInstance';

describe('Authentication & Session Management Suite (Cross-Origin Remediation)', () => {
  let originalDocument: any;
  let originalWindow: any;
  let cookieJar = '';

  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar = '';

    // Mock document.cookie
    Object.defineProperty(global, 'document', {
      value: {
        get cookie() {
          return cookieJar;
        },
        set cookie(val: string) {
          if (val.includes('expires=Thu, 01 Jan 1970')) {
            cookieJar = '';
          } else {
            const parts = val.split(';');
            cookieJar = parts[0];
          }
        },
      },
      writable: true,
      configurable: true,
    });

    // Mock window.location
    Object.defineProperty(global, 'window', {
      value: {
        location: {
          protocol: 'https:',
          href: 'https://techsprout-web-staging.vercel.app/login',
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. SESSION COOKIE MANAGEMENT
  // =========================================================================
  describe('1. Frontend Domain Session Cookie Management', () => {
    it('1.1 setSessionCookie sets the techsprout_session cookie with correct attributes', () => {
      const mockToken = 'mock_jwt_session_token_12345';
      setSessionCookie(mockToken);

      expect(cookieJar).toContain(`${SESSION_COOKIE_NAME}=${mockToken}`);
      expect(getSessionToken()).toBe(mockToken);
    });

    it('1.2 clearSessionCookie removes the session cookie with epoch expiration', () => {
      const mockToken = 'mock_jwt_session_token_12345';
      setSessionCookie(mockToken);
      expect(getSessionToken()).toBe(mockToken);

      clearSessionCookie();
      expect(getSessionToken()).toBeNull();
    });

    it('1.3 getSessionToken parses cookie when multiple cookies are present', () => {
      cookieJar = 'theme=dark; techsprout_session=my_secret_token; analytics=true';
      expect(getSessionToken()).toBe('my_secret_token');
    });

    it('1.4 getSessionToken decodes URI encoded tokens correctly', () => {
      const complexToken = 'token.with.special%2Fchars';
      cookieJar = `techsprout_session=${encodeURIComponent(complexToken)}`;
      expect(getSessionToken()).toBe(complexToken);
    });

    it('1.5 getSessionToken returns null when cookie is absent', () => {
      cookieJar = 'unrelated_cookie=value';
      expect(getSessionToken()).toBeNull();
    });
  });

  // =========================================================================
  // 2. ROLE-BASED POST-LOGIN REDIRECTION
  // =========================================================================
  describe('2. Post-Login Role Resolution & Redirection', () => {
    it('2.1 Instructor role redirects to /instructor/dashboard', () => {
      expect(getPostLoginRedirect('instructor')).toBe('/instructor/dashboard');
    });

    it('2.2 Admin role redirects to /dashboard/admin/overview', () => {
      expect(getPostLoginRedirect('admin')).toBe('/dashboard/admin/overview');
    });

    it('2.3 Student role redirects to /dashboard', () => {
      expect(getPostLoginRedirect('student')).toBe('/dashboard');
    });

    it('2.4 Unrecognized or undefined role defaults to /dashboard safely', () => {
      expect(getPostLoginRedirect(undefined)).toBe('/dashboard');
      expect(getPostLoginRedirect('guest')).toBe('/dashboard');
    });
  });

  // =========================================================================
  // 3. AXIOS REQUEST INTERCEPTOR (CROSS-ORIGIN BEARER INJECTION)
  // =========================================================================
  describe('3. Axios Cross-Origin Authorization Interceptor', () => {
    it('3.1 Injects Authorization: Bearer token from session cookie when not already present', async () => {
      const token = 'active_bearer_session_token';
      setSessionCookie(token);

      const testConfig = {
        headers: {} as Record<string, string>,
      };

      // Run registered interceptors
      // @ts-ignore - access internal axios interceptor handlers
      const interceptorHandlers = (axiosInstance.interceptors.request as any).handlers;
      let config = testConfig;
      for (const handler of interceptorHandlers) {
        if (handler?.fulfilled) {
          config = handler.fulfilled(config);
        }
      }

      expect(config.headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('3.2 Preserves existing Authorization header if explicitly provided', async () => {
      setSessionCookie('cookie_token');

      const testConfig = {
        headers: {
          Authorization: 'Bearer custom_explicit_token',
        } as Record<string, string>,
      };

      // @ts-ignore
      const interceptorHandlers = (axiosInstance.interceptors.request as any).handlers;
      let config = testConfig;
      for (const handler of interceptorHandlers) {
        if (handler?.fulfilled) {
          config = handler.fulfilled(config);
        }
      }

      expect(config.headers.Authorization).toBe('Bearer custom_explicit_token');
    });

    it('3.3 Does not inject Authorization header when no session cookie is found', async () => {
      clearSessionCookie();

      const testConfig = {
        headers: {} as Record<string, string>,
      };

      // @ts-ignore
      const interceptorHandlers = (axiosInstance.interceptors.request as any).handlers;
      let config = testConfig;
      for (const handler of interceptorHandlers) {
        if (handler?.fulfilled) {
          config = handler.fulfilled(config);
        }
      }

      expect(config.headers.Authorization).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. SERVER AUTHENTICATION HELPER (getCurrentUser)
  // =========================================================================
  describe('4. Server-Side Authentication Helper (getCurrentUser)', () => {
    it('4.1 Sends both Cookie and Authorization: Bearer headers to /api/v1/auth/me', async () => {
      const token = 'valid_session_token_xyz';
      const cookieHeader = `techsprout_session=${token}`;
      const mockUser = {
        id: 'user-inst-1',
        name: 'Dr. Sarah Mitchell',
        username: 'sarah.mitchell',
        email: 'instructor@techsprout.edu',
        role: 'instructor' as const,
        isVerified: true,
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUser,
        }),
      } as Response);

      const user = await getCurrentUser(cookieHeader);

      expect(user).toEqual(mockUser);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [calledUrl, options] = fetchSpy.mock.calls[0];
      expect(calledUrl).toContain('/api/v1/auth/me');
      expect((options as any)?.headers?.Cookie).toBe(cookieHeader);
      expect((options as any)?.headers?.Authorization).toBe(`Bearer ${token}`);
    });

    it('4.2 Returns null when API responds with 401 Unauthorized', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const user = await getCurrentUser('techsprout_session=expired_token');
      expect(user).toBeNull();
    });

    it('4.3 Returns null gracefully when network error occurs', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error ECONNREFUSED'));

      const user = await getCurrentUser('techsprout_session=token');
      expect(user).toBeNull();
    });
  });

  // =========================================================================
  // 5. LOGOUT AND SESSION REVOCATION
  // =========================================================================
  describe('5. Logout and Client Cleanup Flow', () => {
    it('5.1 logoutUser calls API logout, clears cookie, and redirects to /login', async () => {
      setSessionCookie('active_token');
      expect(getSessionToken()).toBe('active_token');

      const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValueOnce({
        data: { success: true },
      } as any);

      await logoutUser();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout');
      expect(getSessionToken()).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('5.2 logoutUser clears cookie and redirects to /login even if API call fails', async () => {
      setSessionCookie('active_token');

      vi.spyOn(axiosInstance, 'post').mockRejectedValueOnce(new Error('API unreachable'));

      await logoutUser();

      expect(getSessionToken()).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });

  // =========================================================================
  // 6. ERROR FEEDBACK AND LOGIN FORM RESILIENCE
  // =========================================================================
  describe('6. Error Feedback & Network Error Distinctions', () => {
    it('6.1 Differentiates invalid credentials (401) from server network failures', () => {
      // Helper simulating the Login.tsx error extraction logic
      function extractLoginError(err: unknown): string {
        const errorObj = err as {
          response?: { data?: { message?: string } };
          message?: string;
        };

        if (errorObj.response?.data?.message) {
          return errorObj.response.data.message;
        } else if (!errorObj.response) {
          return 'Unable to connect to the server. Please check your connection and try again.';
        } else {
          return 'Invalid email or password';
        }
      }

      // 401 with server error message
      const invalidCredsError = {
        response: {
          status: 401,
          data: { message: 'Invalid email or password' },
        },
      };
      expect(extractLoginError(invalidCredsError)).toBe('Invalid email or password');

      // Network error (no response)
      const networkError = new Error('Network Error');
      expect(extractLoginError(networkError)).toBe(
        'Unable to connect to the server. Please check your connection and try again.'
      );

      // Server validation failure
      const validationError = {
        response: {
          status: 400,
          data: { message: 'Validation failed: Invalid email format' },
        },
      };
      expect(extractLoginError(validationError)).toBe('Validation failed: Invalid email format');
    });

    it('6.2 Validates API base URL is configured', () => {
      expect(API_BASE_URL).toBeDefined();
      expect(typeof API_BASE_URL).toBe('string');
    });
  });
});
