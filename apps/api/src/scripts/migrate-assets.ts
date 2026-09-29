import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

// Load environment variables from apps/api/.env
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

interface AssetDefinition {
  originalAsset: string;
  type: 'image' | 'video';
  localPath?: string;
  sourceUrl?: string;
  folder: string;
  publicId: string;
  resourceType: 'image' | 'video';
}

export interface MigratedAssetRecord {
  originalAsset: string;
  type: 'image' | 'video';
  cloudinaryFolder: string;
  cloudinaryPublicId: string;
  resourceType: 'image' | 'video';
  secureUrl: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  verified: boolean;
  httpStatus?: number;
}

const WEB_ROOT = path.resolve(__dirname, '../../../web');
const ASSETS_IMG_DIR = path.resolve(WEB_ROOT, 'src/assets/img');

// 18 Dynamic / Content Images
const DYNAMIC_IMAGES: AssetDefinition[] = [
  // Course thumbnails (4)
  {
    originalAsset: 'courses03.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'courses/courses03.jpg'),
    folder: 'techsprout/images/courses',
    publicId: 'courses03',
    resourceType: 'image',
  },
  {
    originalAsset: 'courses05.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'courses/courses05.jpg'),
    folder: 'techsprout/images/courses',
    publicId: 'courses05',
    resourceType: 'image',
  },
  {
    originalAsset: 'courses06.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'courses/courses06.jpg'),
    folder: 'techsprout/images/courses',
    publicId: 'courses06',
    resourceType: 'image',
  },
  {
    originalAsset: 'courses10.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'courses/courses10.jpg'),
    folder: 'techsprout/images/courses',
    publicId: 'courses10',
    resourceType: 'image',
  },
  // Instructor photos (4)
  {
    originalAsset: 'instructor01.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'instructors/instructor01.png'),
    folder: 'techsprout/images/instructors',
    publicId: 'instructor01',
    resourceType: 'image',
  },
  {
    originalAsset: 'instructor02.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'instructors/instructor02.png'),
    folder: 'techsprout/images/instructors',
    publicId: 'instructor02',
    resourceType: 'image',
  },
  {
    originalAsset: 'instructor03.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'instructors/instructor03.png'),
    folder: 'techsprout/images/instructors',
    publicId: 'instructor03',
    resourceType: 'image',
  },
  {
    originalAsset: 'instructor04.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'instructors/instructor04.png'),
    folder: 'techsprout/images/instructors',
    publicId: 'instructor04',
    resourceType: 'image',
  },
  // Site content: Blog standard images (3)
  {
    originalAsset: 'blog_standard01.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'blogs/blog_standard01.jpg'),
    folder: 'techsprout/images/site',
    publicId: 'blog_standard01',
    resourceType: 'image',
  },
  {
    originalAsset: 'blog_standard02.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'blogs/blog_standard02.jpg'),
    folder: 'techsprout/images/site',
    publicId: 'blog_standard02',
    resourceType: 'image',
  },
  {
    originalAsset: 'blog_standard03.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'blogs/blog_standard03.jpg'),
    folder: 'techsprout/images/site',
    publicId: 'blog_standard03',
    resourceType: 'image',
  },
  // Site content: Testimonials (2)
  {
    originalAsset: 'testimonial01.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'testimonial/testimonial01.png'),
    folder: 'techsprout/images/site',
    publicId: 'testimonial01',
    resourceType: 'image',
  },
  {
    originalAsset: 'testimonial02.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'testimonial/testimonial02.png'),
    folder: 'techsprout/images/site',
    publicId: 'testimonial02',
    resourceType: 'image',
  },
  // Site content: About gallery (5)
  {
    originalAsset: 'about_img01.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'about/about_img01.png'),
    folder: 'techsprout/images/site',
    publicId: 'about_img01',
    resourceType: 'image',
  },
  {
    originalAsset: 'about_img02.png',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'about/about_img02.png'),
    folder: 'techsprout/images/site',
    publicId: 'about_img02',
    resourceType: 'image',
  },
  {
    originalAsset: 'about_img03.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'about/about_img03.jpg'),
    folder: 'techsprout/images/site',
    publicId: 'about_img03',
    resourceType: 'image',
  },
  {
    originalAsset: 'about_img04.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'about/about_img04.jpg'),
    folder: 'techsprout/images/site',
    publicId: 'about_img04',
    resourceType: 'image',
  },
  {
    originalAsset: 'about_img05.jpg',
    type: 'image',
    localPath: path.join(ASSETS_IMG_DIR, 'about/about_img05.jpg'),
    folder: 'techsprout/images/site',
    publicId: 'about_img05',
    resourceType: 'image',
  },
];

// Mock Video Assets (2 unique videos, migrated to courses & lessons conventions)
const VIDEO_ASSETS: AssetDefinition[] = [
  // Big Buck Bunny demo video for courses
  {
    originalAsset: 'https://www.w3schools.com/html/mov_bbb.mp4',
    type: 'video',
    sourceUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    folder: 'techsprout/videos/courses',
    publicId: 'mov_bbb',
    resourceType: 'video',
  },
  // Big Buck Bunny demo video for lessons
  {
    originalAsset: 'https://www.w3schools.com/html/mov_bbb.mp4',
    type: 'video',
    sourceUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    folder: 'techsprout/videos/lessons',
    publicId: 'mov_bbb',
    resourceType: 'video',
  },
  // HTML5 sample movie for courses
  {
    originalAsset: 'https://www.w3schools.com/html/movie.mp4',
    type: 'video',
    sourceUrl: 'https://www.w3schools.com/html/movie.mp4',
    folder: 'techsprout/videos/courses',
    publicId: 'movie',
    resourceType: 'video',
  },
  // HTML5 sample movie for lessons
  {
    originalAsset: 'https://www.w3schools.com/html/movie.mp4',
    type: 'video',
    sourceUrl: 'https://www.w3schools.com/html/movie.mp4',
    folder: 'techsprout/videos/lessons',
    publicId: 'movie',
    resourceType: 'video',
  },
];

async function verifyUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    // Retry with GET if HEAD is not supported by edge node
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-100' } });
      return { ok: res.ok, status: res.status };
    } catch (innerErr) {
      return { ok: false, status: 0 };
    }
  }
}

export async function runAssetMigration(): Promise<MigratedAssetRecord[]> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret || cloudName === 'placeholder-cloud-name') {
    console.error('ERROR: Cloudinary credentials are not properly configured.');
    console.error('Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in apps/api/.env');
    process.exit(1);
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  console.log(`Starting Cloudinary Migration using Cloud Name: ${cloudName}`);
  console.log(`------------------------------------------------------------`);

  const results: MigratedAssetRecord[] = [];
  const allAssets = [...DYNAMIC_IMAGES, ...VIDEO_ASSETS];

  for (const asset of allAssets) {
    console.log(`Uploading [${asset.resourceType.toUpperCase()}] ${asset.originalAsset} -> ${asset.folder}/${asset.publicId}...`);
    try {
      let uploadResult: UploadApiResponse;

      if (asset.localPath) {
        if (!fs.existsSync(asset.localPath)) {
          throw new Error(`Local file not found: ${asset.localPath}`);
        }
        uploadResult = await cloudinary.uploader.upload(asset.localPath, {
          folder: asset.folder,
          public_id: asset.publicId,
          resource_type: asset.resourceType,
          overwrite: true,
          unique_filename: false,
          use_filename: false,
        });
      } else if (asset.sourceUrl) {
        uploadResult = await cloudinary.uploader.upload(asset.sourceUrl, {
          folder: asset.folder,
          public_id: asset.publicId,
          resource_type: asset.resourceType,
          overwrite: true,
          unique_filename: false,
          use_filename: false,
        });
      } else {
        throw new Error('Neither localPath nor sourceUrl specified for asset.');
      }

      console.log(`Uploaded: ${uploadResult.secure_url} (${uploadResult.bytes} bytes, format: ${uploadResult.format})`);

      // Verify the uploaded asset is live and accessible over HTTPS
      console.log(`Verifying live accessibility of ${uploadResult.secure_url}...`);
      const verification = await verifyUrl(uploadResult.secure_url);
      console.log(`Verification status: HTTP ${verification.status} (${verification.ok ? 'SUCCESS' : 'FAILED'})`);

      results.push({
        originalAsset: asset.originalAsset,
        type: asset.type,
        cloudinaryFolder: asset.folder,
        cloudinaryPublicId: uploadResult.public_id,
        resourceType: asset.resourceType,
        secureUrl: uploadResult.secure_url,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
        width: uploadResult.width,
        height: uploadResult.height,
        duration: uploadResult.duration,
        verified: verification.ok,
        httpStatus: verification.status,
      });
    } catch (error: any) {
      console.error(`FAILED to migrate ${asset.originalAsset}: ${error.message}`);
      throw error;
    }
  }

  // Save migration manifest
  const manifestPath = path.resolve(__dirname, '../modules/media/migration-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nMigration completed successfully! Manifest written to: ${manifestPath}`);

  return results;
}

if (require.main === module) {
  runAssetMigration().catch((err) => {
    console.error('Migration aborted:', err);
    process.exit(1);
  });
}
