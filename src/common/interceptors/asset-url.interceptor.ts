import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { StorageService } from '../../storage/storage.service';

// Object fields that may hold a stored storage key and must be exposed to
// clients as absolute public URLs.
const ASSET_FIELDS = new Set(['image', 'logoImage']);

/**
 * Rewrites storage keys found in API responses into absolute, cacheable public
 * URLs (e.g. `menu-items/1719-...-pizza.jpg` -> `https://cdn.example.com/...`).
 *
 * Runs after ClassSerializerInterceptor so it operates on plain serialized
 * data regardless of whether a handler returned a TypeORM entity or a plain
 * object (e.g. order items built in services).
 */
@Injectable()
export class AssetUrlInterceptor implements NestInterceptor {
  constructor(private readonly storageService: StorageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transform(data)));
  }

  private transform(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item));
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (ASSET_FIELDS.has(key)) {
          if (typeof record[key] === 'string') {
            record[key] = this.storageService.toPublicUrl(record[key]);
          }
        } else {
          record[key] = this.transform(record[key]);
        }
      }
      return record;
    }

    return value;
  }
}
