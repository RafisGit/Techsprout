# ADR 002: PostgreSQL 16+ with Drizzle ORM and SQL Migrations

**Status:** Approved  
**Date:** 2026-09-27  
**Deciders:** TechSprout Engineering Team  

---

## 1. Context

The legacy repository used MongoDB with Mongoose document models. For an educational and financial system (course orders, student enrollments, exam results, certificates, and financial ledgers), MongoDB presents severe drawbacks:
1. **Financial Integrity:** Educational courses and future payment transactions require strict ACID transactions, foreign keys, unique constraints, and integer-based currency representations (BDT Paisa).
2. **Schema Drift & Validation:** Mongoose schemas allowed arbitrary data injection at runtime.
3. **No Migration Versioning:** Lack of deterministic, forward-backward SQL migration scripts creates production deployment hazards.

---

## 2. Decision

We adopt **PostgreSQL 16+** as the authoritative single source of truth, paired with **Drizzle ORM** for TypeScript schema definitions and **drizzle-kit** for deterministic SQL migrations.

### Principles:
1. **No Runtime Auto-Sync:** Schema synchronization (`db push` in production) is strictly prohibited. All database changes must be executed via compiled SQL migration files.
2. **Relational Constraints:** Every relationship uses foreign keys with defined `ON DELETE` semantics, unique indices, and check constraints.
3. **Monetary Precision:** All future monetary fields must be stored as integers representing Bangladeshi Paisa (e.g. 100000 Paisa = 1000.00 BDT).
4. **Audit Immutability:** Audit log tables are append-only; update/delete operations are forbidden.
5. **UUID Primary Keys:** All tables use UUIDv4 identifiers to prevent sequential enumeration attacks.

---

## 3. P1 Schema Scope

The P1 foundation schema defines:
- `users`: Core identity table (name, username, email, phone, password_hash, is_active, is_verified, timestamps).
- `roles`: System roles (`admin`, `student`).
- `user_roles`: Many-to-many role mapping.
- `sessions`: Active user sessions for browser cookies and multi-device management.
- `otps`: Redis-backed / DB-backed ephemeral OTP verification records.
- `audit_logs`: Append-only security and administrative audit trail.

---

## 4. Consequences

### Positive
- Strict referential integrity and compile-time type safety.
- Zero-overhead SQL generation via Drizzle ORM.
- Auditable, reviewable SQL migration files stored in version control.

### Negative / Trade-offs
- Schema changes require authoring and running explicit migration steps.
- Local development requires PostgreSQL (or a reliable in-memory PG emulator for CI/unit testing).
