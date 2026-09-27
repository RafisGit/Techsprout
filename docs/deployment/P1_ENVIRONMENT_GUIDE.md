# P1 Environment Configuration Guide

**Date:** 2026-09-27  

---

## 1. Environment Variable Reference

### NestJS API (`apps/api/.env`)
| Variable | Description | Required | Example |
|---|---|---|---|
| `PORT` | API listen port | No (Default: 3001) | `3001` |
| `NODE_ENV` | Environment mode (`development`, `test`, `production`) | Yes | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://postgres:postgres@localhost:5432/techsprout` |
| `AUTH_SECRET` | 32+ char secret for session/cookie signing | Yes | `min_32_characters_secret_key_for_hashing_and_signing` |
| `REDIS_URL` | Redis connection URL for queues & OTPs | Optional (fallback to memory) | `redis://localhost:6379` |
| `WEB_ORIGIN` | Allowed web origin for CORS | Yes | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Optional in dev | `placeholder-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Optional in dev | `placeholder-google-client-secret` |
| `SMS_GATEWAY_API_KEY` | BD SMS Provider API Key | Optional in dev (mocked) | `placeholder-sms-api-key` |

### Next.js Web (`apps/web/.env.local`)
| Variable | Description | Required | Example |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL for NestJS API | Yes | `http://localhost:3001` |
| `NEXT_PUBLIC_APP_URL` | Base URL for Next.js App | Yes | `http://localhost:3000` |
| `AUTH_SECRET` | Secret for middleware session validation | Yes | `min_32_characters_secret_key_for_hashing_and_signing` |

---

## 2. Secrets Handling Best Practices
1. Never commit `.env`, `.env.local`, or any file with real secrets to Git.
2. In production, provide secrets using secure environment secret managers (e.g. AWS Secrets Manager, Doppler, Vault, or Cloudflare/Vercel/Render Environment Variables).
3. Do not place server secrets in `NEXT_PUBLIC_*` variables.
