import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSessionToken,
  getPostLoginRedirect,
  logoutUser,
  SESSION_COOKIE_NAME,
} from '@/lib/session';
import { getCurrentUser } from '@/auth';
import { axiosInstance, API_BASE_URL, getApiBaseUrl } from '@/lib/axiosInstance';
import { NextRequest } from 'next/server';

describe('Next.js BFF Secure Authentication & Session Architecture Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.location
    Object.defineProperty(global, 'window', {
      value: {
        location: {
          protocol: 'https:',
          href: 'https://techsprout-web-staging.vercel.app/login',
          origin: 'https://techsprout-web-staging.vercel.app',
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
  // 1. INACCESSIBILITY OF SENSITIVE TOKENS TO CLIENT JAVASCRIPT
  // =========================================================================
  describe('1. Token Inaccessibility to Client-Side JavaScript (XSS Defense)', () => {
    it('1.1 getSessionToken returns null to prevent script access to session tokens', () => {
      expect(getSessionToken()).toBeNull();
    });

    it('1.2 SESSION_COOKIE_NAME constant is correctly defined', () => {
      expect(SESSION_COOKIE_NAME).toBe('techsprout_session');
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

    it('2.4 Unrecognized or undefined role defaults safely to /dashboard', () => {
      expect(getPostLoginRedirect(undefined)).toBe('/dashboard');
      expect(getPostLoginRedirect('guest')).toBe('/dashboard');
    });
  });

  // =========================================================================
  // 3. AXIOS SAME-ORIGIN ROUTING & LEAK PREVENTION
  // =========================================================================
  describe('3. Axios Same-Origin BFF Routing & Credential Isolation', () => {
    it('3.1 Client axios instance routes through same-origin relative base in browser', () => {
      expect(getApiBaseUrl(true)).toBe('');
      expect(getApiBaseUrl(false)).toBe(
        process.env.INTERNAL_API_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          'http://localhost:3001'
      );
    });

    it('3.2 Credentialed requests (HttpOnly cookies) are enabled on axios instance', () => {
      expect(axiosInstance.defaults.withCredentials).toBe(true);
    });

    it('3.3 Does not expose Authorization Bearer header interceptor to external domains', () => {
      const handlers = (axiosInstance.interceptors.request as any).handlers;
      expect(handlers.length).toBe(0);
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

    it('4.2 Returns null when backend responds with 401 Unauthorized', async () => {
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
    it('5.1 logoutUser calls BFF logout endpoint and redirects to /login', async () => {
      const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValueOnce({
        data: { success: true },
      } as any);

      await logoutUser();

      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout');
      expect(window.location.href).toBe('/login');
    });

    it('5.2 logoutUser redirects to /login even if API call fails', async () => {
      vi.spyOn(axiosInstance, 'post').mockRejectedValueOnce(new Error('API unreachable'));

      await logoutUser();

      expect(window.location.href).toBe('/login');
    });
  });

  // =========================================================================
  // 6. ERROR FEEDBACK AND LOGIN FORM RESILIENCE
  // =========================================================================
  describe('6. Error Feedback & Network Error Distinctions', () => {
    it('6.1 Differentiates invalid credentials (401) from server network failures', () => {
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
  });

  // =========================================================================
  // 7. BFF PROXY ROUTE HANDLER LOGIC
  // =========================================================================
  describe('7. BFF Proxy Route Handler Specifications', () => {
    it('7.1 Rejects cross-origin state-changing requests when Origin does not match Host (CSRF Defense)', async () => {
      const { POST } = await import('@/app/api/v1/[...path]/route');

      const mockReq = new NextRequest('http://localhost:3000/api/v1/orders', {
        method: 'POST',
        headers: {
          origin: 'https://malicious-site.com',
          host: 'localhost:3000',
        },
      });

      const response = await POST(mockReq, {
        params: Promise.resolve({ path: ['orders'] }),
      });

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.message).toContain('Forbidden');
    });

    it('7.2 Strips session token from response body on successful login and sets HttpOnly cookie', async () => {
      const { POST } = await import('@/app/api/v1/[...path]/route');

      const fakeToken = 'backend_super_secret_token_12345';
      const fakeUser = {
        id: 'u-1',
        name: 'Dr. Mitchell',
        role: 'instructor',
      };

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          message: 'Login successful',
          token: fakeToken,
          user: fakeUser,
        }),
      } as Response);

      const mockReq = new NextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: JSON.stringify({ email: 'instructor@techsprout.edu', password: 'pass' }),
      });

      const response = await POST(mockReq, {
        params: Promise.resolve({ path: ['auth', 'login'] }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();

      // Raw token MUST be scrubbed from the JSON body
      expect(json.token).toBeUndefined();
      expect(json.user).toEqual(fakeUser);

      // HttpOnly cookie MUST be set on the response
      const cookie = response.cookies.get('techsprout_session');
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe(fakeToken);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    });

    it('7.3 Short-circuits /api/v1/auth/me with 401 when session cookie is absent', async () => {
      const { GET } = await import('@/app/api/v1/[...path]/route');

      const mockReq = new NextRequest('http://localhost:3000/api/v1/auth/me', {
        method: 'GET',
      });

      const response = await GET(mockReq, {
        params: Promise.resolve({ path: ['auth', 'me'] }),
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.message).toBe('Authentication required');
    });
  });
});
