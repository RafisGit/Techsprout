export const CLOUDINARY_CONFIG = 'CLOUDINARY_CONFIG';
export const CLOUDINARY_CLIENT = 'CLOUDINARY_CLIENT';

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
}
