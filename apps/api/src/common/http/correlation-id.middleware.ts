import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface AuthenticatedRequest extends Request {
  id?: string;
  user?: {
    id: string;
    email: string;
    username: string;
    name: string;
    role: string;
    isVerified: boolean;
  };
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const existingId = req.headers['x-request-id'] as string;
    const correlationId = existingId || `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

    req.id = correlationId;
    res.setHeader('X-Request-Id', correlationId);

    next();
  }
}
