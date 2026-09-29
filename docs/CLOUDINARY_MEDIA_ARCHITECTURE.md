# Cloudinary Media Platform Architecture & Integration Guide

## 1. Overview & Architectural Foundation

TechSprout School LMS utilizes **Cloudinary** as the canonical cloud media platform for all dynamic images and videos.

As a **Pre-P2 Infrastructure Foundation**, all Cloudinary SDK operations and credentials are strictly centralized in the NestJS API backend. The frontend application never directly accesses Cloudinary administrative SDKs or private API credentials.

```
+-------------------------------------------------------------------------+
|                                FRONTEND                                 |
|                                (Next.js)                                |
|  - Renders media using Next.js <Image /> & HTML5 <video />              |
|  - Consumes client-safe transformations via @/lib/cloudinary.ts         |
|  - Requests authorized upload signatures from API for large assets      |
+------------------------------------+------------------------------------+
                                     |
                                     | 1. Authenticated REST request
                                     v
+------------------------------------+------------------------------------+
|                               NESTJS API                                |
|                         (apps/api/src/modules/media)                    |
|  - Guards: AuthGuard (Session Cookie / Bearer) + RolesGuard (Admin/Inst)|
|  - MediaService: Validation (MIME, size), Naming & Path Sanitization    |
|  - AuditService: Secure audit logging for all media mutations           |
+------------------------------------+------------------------------------+
                                     |
                                     | 2. Server-side SDK operations
                                     v
+------------------------------------+------------------------------------+
|                         CLOUDINARY SERVICE                              |
|  - Credentials strictly server-side (CLOUDINARY_API_SECRET)             |
|  - Image & Video upload streams                                         |
|  - Media deletion with resource_type awareness                          |
|  - SHA-1/SHA-256 upload signature generation                            |
+------------------------------------+------------------------------------+
                                     |
                                     | 3. Managed Storage & Global CDN
                                     v
+------------------------------------+------------------------------------+
|                            CLOUDINARY                                   |
|  - Images: res.cloudinary.com/<cloud>/image/upload/...                  |
|  - Videos: res.cloudinary.com/<cloud>/video/upload/...                  |
+-------------------------------------------------------------------------+
```

### Direct Signed Upload Workflow (Large Assets & Videos)

To prevent large video files (such as multi-megabyte/gigabyte lesson video lessons) from bottlenecking the NestJS backend as an unnecessary proxy, the architecture provides a **Signed Upload Workflow**:

1. **Client Request**: Authorized Admin/Instructor requests an upload signature via `POST /api/v1/media/signature`.
2. **Server Authorization**: NestJS validates user role (`admin` or `instructor`), sanitizes target folder and filename, and signs the upload parameters using the private `CLOUDINARY_API_SECRET`.
3. **Direct Upload**: The client receives `{ signature, timestamp, apiKey, cloudName, folder, publicId, uploadUrl }` and uploads the file directly to Cloudinary's REST API endpoint.
4. **No Secrets Exposed**: The API Secret remains exclusively on the server.

---

## 2. Cloudinary Account Creation & Configuration

1. **Sign Up**: Register for a free or institutional account at [https://cloudinary.com](https://cloudinary.com).
2. **Dashboard**: Navigate to your **Cloudinary Management Console**.
3. **Credentials**: Under **Product Environment Credentials**, copy:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
4. **Security Settings**:
   - Ensure **Strict transformations** or standard delivery is enabled.
   - Whitelist allowed formats and delivery types.

---

## 3. Environment Variables & Secret Separation

| Environment Variable                | Where Configured                 | Secret Level              | Purpose                                     |
| ----------------------------------- | -------------------------------- | ------------------------- | ------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME`             | Backend (`apps/api/.env`)        | Public / Server           | Cloudinary Cloud identifier                 |
| `CLOUDINARY_API_KEY`                | Backend (`apps/api/.env`)        | Public / Server           | Cloudinary API Key                          |
| `CLOUDINARY_API_SECRET`             | Backend (`apps/api/.env`)        | **STRICTLY CONFIDENTIAL** | Server-side signing & management secret     |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Frontend (`apps/web/.env.local`) | Public                    | Safe client-side URL transformation builder |

> [!CAUTION]
> `CLOUDINARY_API_SECRET` MUST NEVER be prefixed with `NEXT_PUBLIC_`, committed to git, or passed to any browser client.

---

## 4. Local Development vs. Production Setup

### Local Development

In `apps/api/.env`:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

In `apps/web/.env.local`:

```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
```

_Note: In local test and CI environments without live Cloudinary credentials, the API gracefully degrades: non-media endpoints function normally, and media unit/E2E test suites use mocked SDK drivers._

### Production Deployment (Render & Vercel)

- **Render API Web Service**: Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` under **Environment Variables**.
- **Vercel Frontend Project**: Add `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` under **Environment Variables**.

---

## 5. Folder Hierarchy & Naming Conventions

All assets on Cloudinary are organized inside the `techsprout/` root namespace:

```
techsprout/
├── images/
│   ├── courses/       # Course thumbnails & cover images
│   ├── instructors/   # Instructor profile avatars and photos
│   ├── categories/    # Category icons and banners
│   └── site/          # Site-wide marketing and general imagery
└── videos/
    ├── courses/       # Promotional & course teaser / demo videos
    └── lessons/       # Course lesson video content
```

### Identifier Sanitization & Collision Prevention

User-controlled raw filenames are never used directly as Cloudinary public IDs. The `MediaService` sanitizes base identifiers:

- Converts to lowercase alphanumeric and hyphens/underscores (`[^a-z0-9_-]` -> `_`)
- Truncates to max 50 characters
- Appends an epoch timestamp and a cryptographically secure random hexadecimal suffix:
  ```ts
  `${sanitizedBase}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  ```
  _Example_: `course-unity-game-dev_1790668229123_857ebe35`

---

## 6. Media Resource Handling

### Images (`resource_type = 'image'`)

- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`
- Maximum file size: **10 MB**
- Stored metadata: `public_id`, `secure_url`, `resource_type`, `format`, `width`, `height`, `bytes`, `original_filename`, `created_at`

### Videos (`resource_type = 'video'`)

- Allowed MIME types: `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`
- Maximum direct API upload size: **100 MB** (For larger files, use direct signed upload)
- Stored metadata: `public_id`, `secure_url`, `resource_type`, `format`, `duration`, `bytes`, `original_filename`, `created_at`
- Videos are explicitly uploaded and deleted with `{ resource_type: 'video' }`.

---

## 7. Repository Media Audit & Asset Classification

### Summary of Audit Findings

- **Total local image files**: 53 (52 in `apps/web/src/assets/img/`, 1 favicon)
- **Total local video files**: 0 (no raw video files stored in repository)
- **Mock video URLs**: 2 distinct external MP4 URLs (`mov_bbb.mp4`, `movie.mp4`) referenced 26 times across 12 courses in `apps/web/src/lib/mockData/mockData.ts`

### Asset Classification

| Category                                                                                                                                    | Count   | Classification              | Action / Destination                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| **Logo & Brand Core** (`logo.png`, `favicon.ico`)                                                                                           | 2       | **Group A: Static UI**      | Keep in local frontend assets / `/public`                                                          |
| **Decorative Shapes & Vectors** (`shapes/*`)                                                                                                | 17      | **Group A: Static UI**      | Keep in local `@/assets/img/shapes/`                                                               |
| **Static Backgrounds & Marketing Assets** (`banner_bg.jpg`, `cta_bg.png`, `cta_bg2.jpg`, `hero-bg.jpg`, `newsletter.png`, `banner_img.png`) | 6       | **Group A: Static UI**      | Keep in local `@/assets/img/`                                                                      |
| **Partner Brand Logos** (`brands/brand01-09` except 07)                                                                                     | 8       | **Group A: Static UI**      | Keep in local `@/assets/img/brands/`                                                               |
| **Course Thumbnails** (`courses/courses03, 05, 06, 10.jpg`)                                                                                 | 4       | **Group B: Dynamic Media**  | Target for Cloudinary migration in P2 (`techsprout/images/courses/`)                               |
| **Instructor Avatars** (`instructors/instructor01-04.png`)                                                                                  | 4       | **Group B: Dynamic Media**  | Target for Cloudinary migration in P2 (`techsprout/images/instructors/`)                           |
| **Blog Featured Images** (`blogs/blog_standard01-03.jpg`)                                                                                   | 3       | **Group B: Dynamic Media**  | Target for Cloudinary migration in P2 (`techsprout/images/site/`)                                  |
| **Testimonial Portraits** (`testimonial/testimonial01-02.png`)                                                                              | 2       | **Group B: Dynamic Media**  | Target for Cloudinary migration in P2 (`techsprout/images/site/`)                                  |
| **About Us Gallery Images** (`about/about_img01-05`)                                                                                        | 5       | **Group B: Dynamic Media**  | Target for Cloudinary migration in P2 (`techsprout/images/site/`)                                  |
| **Course Demo / Lesson Videos** (Mock W3Schools URLs)                                                                                       | 26 refs | **Group B: Dynamic Media**  | Target for Cloudinary migration in P2 (`techsprout/videos/courses/`, `techsprout/videos/lessons/`) |
| **Orphan Asset** (`brands/brand07.png`)                                                                                                     | 1       | **Group C: Obsolete**       | Retained safely in codebase; unreferenced by `mockData.ts`                                         |
| **Product Guidelines PDF**                                                                                                                  | 2       | **Group D: Reference Docs** | Retained in `/public` & project root for design documentation                                      |

---

## 8. Frontend Delivery Helper (`@/lib/cloudinary.ts`)

A lightweight, client-safe helper is available in `apps/web/src/lib/cloudinary.ts`:

```tsx
import { getOptimizedImageUrl, getOptimizedVideoUrl } from '@/lib/cloudinary';

// 1. Automatic optimization for Cloudinary images (avif/webp + responsive scaling)
const optimizedThumb = getOptimizedImageUrl(course.thumbnail, {
  width: 375,
  height: 250,
  crop: 'fill',
  quality: 'auto',
  format: 'auto',
});

// 2. Video optimization (safe passthrough for external/mock videos)
const optimizedVideo = getOptimizedVideoUrl(course.demoVideo, {
  quality: 'auto',
  format: 'auto',
});
```

_Next.js Image Security_: `res.cloudinary.com` is configured in `next.config.ts` under `images.remotePatterns`.

---

## 9. API REST Endpoints Reference

All endpoints are prefixed with `/api/v1/media`:

| Method   | Endpoint                     | Access / Role         | Description                                                |
| -------- | ---------------------------- | --------------------- | ---------------------------------------------------------- |
| `POST`   | `/api/v1/media/upload/image` | `admin`, `instructor` | Upload image buffer with validation & audit logging        |
| `POST`   | `/api/v1/media/upload/video` | `admin`, `instructor` | Upload video buffer with validation & audit logging        |
| `POST`   | `/api/v1/media/signature`    | `admin`, `instructor` | Generate signed upload parameters for direct client upload |
| `DELETE` | `/api/v1/media`              | `admin`               | Delete asset by `publicId` and `resourceType`              |
| `POST`   | `/api/v1/media/replace`      | `admin`, `instructor` | Replace existing asset with new upload and delete old      |
| `GET`    | `/api/v1/media/url/*`        | Public                | Resolve public Cloudinary CDN URL                          |

---

## 10. Phase P2 Media Roadmap

When implementing Phase P2 (Course Catalog & Lesson Management):

1. **Database Schema**: Add `thumbnail_public_id`, `thumbnail_url`, `demo_video_public_id`, `demo_video_url` columns to courses table; add `video_public_id`, `video_url`, `duration_seconds` to lessons table.
2. **Media Association**: Use `media.service.ts` to attach uploaded media public IDs and CDN URLs to catalog records.
3. **Database Seeding**: Upload seed course thumbnails and demo videos to Cloudinary and populate database seed fixtures.
4. **Mock Data Deprecation**: Transition frontend consumers from `@/lib/mockData` to API queries powered by React Query.

---

## 11. Pre-P2 Dynamic Media Migration Manifest (Verified)

Physical asset migration executed via `apps/api/src/scripts/migrate-assets.ts`. All 18 dynamic content images and 4 video endpoints (representing the 2 unique mock videos referenced 26 times across courses/lessons) have been physically uploaded to Cloudinary, verified with live HTTP 200 checks, and recorded in `apps/api/src/modules/media/migration-manifest.json`.

### Verified Asset Migration Table

| Original Asset | Type | Cloudinary Public ID | Resource Type | Dimensions / Duration | Size | Secure URL | Verified |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `courses03.jpg` | image | `techsprout/images/courses/courses03` | image | 1400x959 | 96.5 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673961/techsprout/images/courses/courses03.jpg` | YES (200) |
| `courses05.jpg` | image | `techsprout/images/courses/courses05` | image | 1400x931 | 85.9 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673963/techsprout/images/courses/courses05.jpg` | YES (200) |
| `courses06.jpg` | image | `techsprout/images/courses/courses06` | image | 1400x936 | 100.3 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673964/techsprout/images/courses/courses06.jpg` | YES (200) |
| `courses10.jpg` | image | `techsprout/images/courses/courses10` | image | 1400x930 | 122.7 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673965/techsprout/images/courses/courses10.jpg` | YES (200) |
| `instructor01.png` | image | `techsprout/images/instructors/instructor01` | image | 250x250 | 61.8 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673966/techsprout/images/instructors/instructor01.png` | YES (200) |
| `instructor02.png` | image | `techsprout/images/instructors/instructor02` | image | 250x250 | 66.9 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673967/techsprout/images/instructors/instructor02.png` | YES (200) |
| `instructor03.png` | image | `techsprout/images/instructors/instructor03` | image | 251x250 | 57.5 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673968/techsprout/images/instructors/instructor03.png` | YES (200) |
| `instructor04.png` | image | `techsprout/images/instructors/instructor04` | image | 251x250 | 51.5 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673970/techsprout/images/instructors/instructor04.png` | YES (200) |
| `blog_standard01.jpg` | image | `techsprout/images/site/blog_standard01` | image | 869x420 | 62.7 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673971/techsprout/images/site/blog_standard01.jpg` | YES (200) |
| `blog_standard02.jpg` | image | `techsprout/images/site/blog_standard02` | image | 869x420 | 47.7 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673972/techsprout/images/site/blog_standard02.jpg` | YES (200) |
| `blog_standard03.jpg` | image | `techsprout/images/site/blog_standard03` | image | 869x420 | 88.4 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673973/techsprout/images/site/blog_standard03.jpg` | YES (200) |
| `testimonial01.png` | image | `techsprout/images/site/testimonial01` | image | 700x700 | 753.0 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673974/techsprout/images/site/testimonial01.png` | YES (200) |
| `testimonial02.png` | image | `techsprout/images/site/testimonial02` | image | 700x700 | 645.3 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673975/techsprout/images/site/testimonial02.png` | YES (200) |
| `about_img01.png` | image | `techsprout/images/site/about_img01` | image | 389x484 | 74.8 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673976/techsprout/images/site/about_img01.png` | YES (200) |
| `about_img02.png` | image | `techsprout/images/site/about_img02` | image | 260x263 | 65.1 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673977/techsprout/images/site/about_img02.png` | YES (200) |
| `about_img03.jpg` | image | `techsprout/images/site/about_img03` | image | 315x411 | 66.6 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673979/techsprout/images/site/about_img03.jpg` | YES (200) |
| `about_img04.jpg` | image | `techsprout/images/site/about_img04` | image | 265x274 | 88.7 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673980/techsprout/images/site/about_img04.jpg` | YES (200) |
| `about_img05.jpg` | image | `techsprout/images/site/about_img05` | image | 265x201 | 77.9 KB | `https://res.cloudinary.com/h6udu3ze/image/upload/v1790673981/techsprout/images/site/about_img05.jpg` | YES (200) |
| `mov_bbb.mp4` (Course) | video | `techsprout/videos/courses/mov_bbb` | video | 320x176 / 10.03s | 788.5 KB | `https://res.cloudinary.com/h6udu3ze/video/upload/v1790673982/techsprout/videos/courses/mov_bbb.mp4` | YES (200) |
| `mov_bbb.mp4` (Lesson) | video | `techsprout/videos/lessons/mov_bbb` | video | 320x176 / 10.03s | 788.5 KB | `https://res.cloudinary.com/h6udu3ze/video/upload/v1790673983/techsprout/videos/lessons/mov_bbb.mp4` | YES (200) |
| `movie.mp4` (Course) | video | `techsprout/videos/courses/movie` | video | 320x240 / 12.61s | 318.5 KB | `https://res.cloudinary.com/h6udu3ze/video/upload/v1790673985/techsprout/videos/courses/movie.mp4` | YES (200) |
| `movie.mp4` (Lesson) | video | `techsprout/videos/lessons/movie` | video | 320x240 / 12.61s | 318.5 KB | `https://res.cloudinary.com/h6udu3ze/video/upload/v1790673987/techsprout/videos/lessons/movie.mp4` | YES (200) |

