import { Injectable, LoggerService } from '@nestjs/common';
import { env } from '../../config/env.config';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly isProduction = env.NODE_ENV === 'production';
  private readonly serviceName = 'techsprout-api';

  private formatMessage(
    level: string,
    message: any,
    context?: string,
    trace?: string
  ): string {
    const timestamp = new Date().toISOString();

    if (this.isProduction) {
      const logObject: Record<string, any> = {
        timestamp,
        level,
        service: this.serviceName,
        environment: env.NODE_ENV,
        context: context || 'App',
        message: typeof message === 'object' ? JSON.stringify(message) : message,
      };

      if (trace) {
        logObject.trace = trace;
      }

      return JSON.stringify(logObject);
    }

    const contextStr = context ? `[${context}] ` : '';
    const traceStr = trace ? `\n${trace}` : '';
    return `[${timestamp}] ${level.toUpperCase()} ${contextStr}${message}${traceStr}`;
  }

  log(message: any, context?: string) {
    console.log(this.formatMessage('info', message, context));
  }

  error(message: any, trace?: string, context?: string) {
    console.error(this.formatMessage('error', message, context, trace));
  }

  warn(message: any, context?: string) {
    console.warn(this.formatMessage('warn', message, context));
  }

  debug(message: any, context?: string) {
    if (!this.isProduction) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  verbose(message: any, context?: string) {
    if (!this.isProduction) {
      console.log(this.formatMessage('verbose', message, context));
    }
  }
}
