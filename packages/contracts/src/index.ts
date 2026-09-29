export type UserRole = 'admin' | 'student' | 'instructor';

export interface UserDto {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface RegisterRequest {
  name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: UserDto;
  token?: string;
}

export interface OtpSendRequest {
  phone: string;
}

export interface OtpVerifyRequest {
  phone: string;
  otp: string;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  requestId?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
  statusCode: number;
  timestamp: string;
  requestId?: string;
  details?: unknown;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  services?: {
    database: 'up' | 'down';
    redis?: 'up' | 'down';
  };
}

export interface AuditLogDto {
  id: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}
