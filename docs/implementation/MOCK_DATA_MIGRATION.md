# Mock Data Migration Strategy

**Date:** 2026-09-27  
**Phase:** P1 Foundation & Security  
**File Reference:** `src/lib/mockData/mockData.ts` & `src/lib/mockData/mockApi.ts`

---

## 1. Overview & Principle

Per Rule 8 of the P1 specification:
> "Existing mock data must eventually become seed data. Do not treat mockData.ts as the production data source."

In P1, our focus is strictly Foundation & Security (authentication, authorization, database, API framework). We must **NOT** prematurely rebuild course catalog, learning player, or blog functionality. Therefore, frontend components displaying catalog information will retain mock data temporarily in `apps/web` while the API and DB foundation is prepared to take over in P2.

---

## 2. Dataset Categorization

| Dataset Name | Primary Purpose in UI | Usage Locations | P1 Classification | Target Phase & Migration Path |
|---|---|---|---|---|
| `users` | User profiles, instructors, reviews | `Comment.tsx`, `ReviewCard.tsx`, `InstructorCard.tsx`, `TopInstructors.tsx`, `mockApi.getUserName` | **MIGRATE TO SEED** | Seeded into PostgreSQL `users` table for initial system test accounts (admin, instructor, student). |
| `courses` | Course catalog, pricing, lessons | `Courses.tsx`, `FeaturedCourses.tsx`, `CourseCard.tsx`, `[course]/page.tsx` | **KEEP TEMPORARILY** | Retained in `apps/web` for visual fidelity; migrated to PostgreSQL `courses` / `modules` / `lessons` in P2. |
| `reviews` | Course ratings & reviews | `[course]/page.tsx`, `ReviewCard.tsx` | **KEEP TEMPORARILY** | Retained in `apps/web`; migrated to PostgreSQL `reviews` table in P2/P3. |
| `blogs` | Blog articles & recent posts | `blogs/page.tsx`, `[blog]/page.tsx`, `LatestBlogs.tsx`, `RecentPostCard.tsx` | **KEEP TEMPORARILY** | Retained in `apps/web`; migrated to CMS/DB in later phase. |
| `brands` | Partner / Client brand logos | `Brands.tsx`, `mockApi.getBrands` | **KEEP TEMPORARILY** | Marketing UI assets; retained in `apps/web`. |
| `testimonials` | Student testimonials | `Testimonial.tsx`, `TestimonialCard.tsx` | **KEEP TEMPORARILY** | Marketing UI assets; retained in `apps/web`. |
| `faqs` | FAQ accordion | `faq/page.tsx` | **KEEP TEMPORARILY** | Retained in `apps/web`; migrated to DB in P3. |
| `aboutUsInfo` | Company statistics & mission | `Discover.tsx` | **KEEP TEMPORARILY** | Marketing copy; retained in `apps/web`. |
| `pricingPlans` | Subscription / pricing plans | Not currently mounted | **DELETE AFTER MIGRATION** | To be deleted or mapped to future billing models in P4. |
| `notifications` | User alerts / notifications | Not currently mounted | **DELETE AFTER MIGRATION** | Retired until notification service is built. |
| `transactions` | Payment / order mock history | Not currently mounted | **DELETE AFTER MIGRATION** | Replaced entirely by SSLCommerz transaction tables in P4. |

---

## 3. Seed Migration Execution Plan (P1 & P2)

### P1 Immediate Action
- Extract test user personas from `users` (e.g., `admin@techsprout.edu`, `student@techsprout.edu`) for insertion into PostgreSQL via Drizzle seed scripts with bcrypt/Argon2id password hashes and assigned roles.

### P2 Catalog Action
- Create Drizzle schema for `courses`, `categories`, `course_instructors`.
- Write migration script to import course objects from `mockData.ts` into PostgreSQL.
- Replace `mockApi.getCategories()` and `mockApi.getFeaturedCourses()` in `apps/web` with typed API client calls to `apps/api` (`/api/v1/courses`).

### Final Cleanup
- Delete `src/lib/mockData/` once all consumers are wired to NestJS API endpoints.
