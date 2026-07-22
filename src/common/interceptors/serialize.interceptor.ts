import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { instanceToPlain } from 'class-transformer';
import { Observable, map } from 'rxjs';

export const SERIALIZE_KEY = 'serialize';

type DtoConstructor = new (...args: any[]) => any;

export function Serialize(dto: DtoConstructor) {
  return SetMetadata(SERIALIZE_KEY, dto);
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const DtoClass = this.reflector.getAllAndOverride<
      DtoConstructor | undefined
    >(SERIALIZE_KEY, [context.getHandler(), context.getClass()]);

    if (!DtoClass) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        const transform = (item: any) => {
          const instance = new DtoClass();
          Object.assign(instance, item);
          return instanceToPlain(instance);
        };

        if (Array.isArray(data)) {
          return data.map(transform);
        }

        if (
          data &&
          typeof data === 'object' &&
          'items' in data &&
          'total' in data
        ) {
          return {
            ...data,
            items: data.items.map(transform),
          };
        }

        return transform(data);
      }),
    );
  }
}
