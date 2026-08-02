import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const start = Date.now();
    const ip = req.ip || req.connection.remoteAddress || '';
    const startDate = new Date().toISOString();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;

      if (method?.toLowerCase() === 'options') {
        return;
      }

      if (statusCode >= 500) {
        this.logger.error(
          ` ${ip} ${method} ${originalUrl} ${statusCode} ${duration}ms`,
        );
      } else if (statusCode >= 400) {
        this.logger.warn(
          ` ${ip} ${method} ${originalUrl} ${statusCode} ${duration}ms`,
        );
      } else {
        this.logger.log(
          ` ${ip} ${method} ${originalUrl} ${statusCode} ${duration}ms`,
        );
      }
    });

    next();
  }
}
