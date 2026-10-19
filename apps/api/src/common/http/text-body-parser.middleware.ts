import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Parses text/plain HTTP request bodies (used by navigator.sendBeacon)
 * without requiring external body-parser or express direct dependencies.
 */
@Injectable()
export class TextBodyParserMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const contentType = req.headers['content-type'] || '';
    const isText = contentType.includes('text/plain') || contentType.includes('text/');
    const isMutation = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';

    if (isText && isMutation && (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0)) {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        data += chunk;
        if (data.length > 64 * 1024) {
          // Protect process memory against unbounded payloads
          data = '';
          req.destroy();
        }
      });
      req.on('end', () => {
        req.body = data;
        next();
      });
      req.on('error', (err) => {
        next(err);
      });
    } else {
      next();
    }
  }
}
