import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../../config/env.config';
import { Logger } from '@nestjs/common';
import { CLOUDINARY_CLIENT } from './cloudinary.config';

export const CloudinaryProvider = {
  provide: CLOUDINARY_CLIENT,
  useFactory: () => {
    const logger = new Logger('CloudinaryProvider');
    const isConfigured = Boolean(
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
    );

    if (isConfigured) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      logger.log('Cloudinary SDK initialized with secure environment credentials');
    } else {
      logger.warn(
        'Cloudinary credentials not provided in environment. Media upload features will require valid configuration.'
      );
    }

    return cloudinary;
  },
};
