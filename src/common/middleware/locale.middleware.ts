import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface LocaleRequest extends Request {
  locale: 'en' | 'ar';
}

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers['accept-language'];
    if (header) {
      const primary = header.split(',')[0].split('-')[0].trim();
      (req as LocaleRequest).locale = primary === 'ar' ? 'ar' : 'en';
    } else {
      (req as LocaleRequest).locale = 'en';
    }
    next();
  }
}
