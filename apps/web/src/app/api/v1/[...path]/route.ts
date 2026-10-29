import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const isProductionOrStaging =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV as string) === 'staging';

/**
 * Next.js Backend-for-Frontend (BFF) Proxy Route Handler
 *
 * Securely mediates all /api/v1/* requests between the browser and the backend API:
 * 1. Stores the session token in an HttpOnly, SameSite=Lax, Secure cookie on the frontend domain.
 * 2. Never exposes the raw authentication token to client-side JavaScript.
 * 3. Enforces same-origin CSRF checks on state-changing requests.
 * 4. Transparently injects the Authorization: Bearer header when forwarding to the backend API.
 * 5. Handles login, register, OTP verification, and session revocation (logout) at the server boundary.
 */
async function proxyRequest(
  request: NextRequest,
  paramsPromise: Promise<{ path?: string[] }>
) {
  const { path: pathSegments = [] } = await paramsPromise;
  const subpath = pathSegments.join('/');
  const targetUrl = `${BACKEND_URL}/api/v1/${subpath}${request.nextUrl.search}`;

  // 1. Defense-in-depth CSRF verification for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            { success: false, message: 'Forbidden: Cross-origin request rejected' },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, message: 'Forbidden: Invalid request origin' },
          { status: 403 }
        );
      }
    }
  }

  // 2. Extract session token from HttpOnly cookie
  const sessionToken = request.cookies.get('techsprout_session')?.value;

  // 3. Short-circuit /auth/me if unauthenticated
  if (subpath === 'auth/me' && !sessionToken) {
    return NextResponse.json(
      { success: false, message: 'Authentication required' },
      { status: 401 }
    );
  }

  // 4. Prepare forward headers
  const forwardHeaders = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) forwardHeaders.set('content-type', contentType);
  const accept = request.headers.get('accept');
  if (accept) forwardHeaders.set('accept', accept);
  const userAgent = request.headers.get('user-agent');
  if (userAgent) forwardHeaders.set('user-agent', userAgent);
  const xRequestId = request.headers.get('x-request-id');
  if (xRequestId) forwardHeaders.set('x-request-id', xRequestId);

  if (sessionToken) {
    forwardHeaders.set('Authorization', `Bearer ${sessionToken}`);
    forwardHeaders.set('Cookie', `techsprout_session=${sessionToken}`);
  }

  // 5. Read body if applicable
  let bodyBuffer: ArrayBuffer | undefined = undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    try {
      bodyBuffer = await request.arrayBuffer();
    } catch {
      // Body may be empty
    }
  }

  // 6. Forward request to backend API
  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: 'Backend API service is currently unavailable. Please try again shortly.',
      },
      { status: 503 }
    );
  }

  // 7. Intercept Authentication Endpoints
  const isAuthLoginOrRegisterOrOtp =
    subpath === 'auth/login' ||
    subpath === 'auth/register' ||
    subpath === 'auth/otp/verify';

  const isAuthLogout = subpath === 'auth/logout';
  const responseContentType = backendResponse.headers.get('content-type') || '';

  if (isAuthLoginOrRegisterOrOtp && responseContentType.includes('application/json')) {
    const data = await backendResponse.json();

    if (backendResponse.ok && data.token) {
      const issuedToken = data.token;
      // Strip sensitive token from client-facing JSON payload
      const sanitized = { ...data };
      delete sanitized.token;

      const res = NextResponse.json(sanitized, { status: backendResponse.status });
      // Set HttpOnly, SameSite=Lax, Secure session cookie on the frontend domain
      res.cookies.set('techsprout_session', issuedToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProductionOrStaging,
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
      return res;
    }

    return NextResponse.json(data, { status: backendResponse.status });
  }

  if (isAuthLogout) {
    let logoutData = { success: true, message: 'Logged out successfully' };
    if (responseContentType.includes('application/json')) {
      try {
        logoutData = await backendResponse.json();
      } catch {
        // Fallback to default
      }
    }

    const res = NextResponse.json(logoutData, { status: backendResponse.status });
    // Invalidate HttpOnly cookie on the frontend domain
    res.cookies.set('techsprout_session', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProductionOrStaging,
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  // 8. General Response Streaming / Forwarding
  const responseHeaders = new Headers();
  if (responseContentType) {
    responseHeaders.set('content-type', responseContentType);
  }

  // Pass Server-Sent Events stream directly to browser without buffering
  if (responseContentType.includes('text/event-stream')) {
    responseHeaders.set('content-type', 'text/event-stream; charset=utf-8');
    responseHeaders.set('cache-control', 'no-cache, no-transform');
    responseHeaders.set('connection', 'keep-alive');
    responseHeaders.set('x-accel-buffering', 'no');
    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  }

  const responseBody = await backendResponse.arrayBuffer();
  return new NextResponse(responseBody, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxyRequest(request, context.params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxyRequest(request, context.params);
}
