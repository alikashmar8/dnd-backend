import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global throttling guard that only applies to HTTP requests.
 *
 * The base ThrottlerGuard (v6) calls `switchToHttp()` unconditionally, which
 * throws for WebSocket contexts. APP_GUARDs also run for Socket.io gateways, so
 * throttling must bypass non-HTTP contexts to keep `/orders`, `/chat` and
 * `/tracking` working. HTTP routes keep the per-route `@Throttle()` overrides.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }
}
