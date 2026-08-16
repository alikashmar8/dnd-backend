import { Injectable, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TrackingService } from './tracking.service';

@WebSocketGateway({ namespace: 'tracking', cors: true })
@Injectable()
export class TrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly trackingService: TrackingService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token as string | undefined;

    if (!token) {
      this.logger.warn('Tracking connection rejected: missing token');
      client.disconnect();
      return;
    }

    try {
      const user = await this.authService.validateUserByToken(token);
      client.data.user = user;
      await client.join(`user_${user.id}`);
      this.logger.log(`Tracking connected: user=${user.id} role=${user.role}`);
      // Ack so clients know the connection is fully established (auth resolved
      // and rooms joined) before they emit subscribe/location events — this is
      // also what a client uses to re-subscribe after a socket reconnect.
      client.emit('connected', { userId: user.id });
    } catch {
      this.logger.warn('Tracking connection rejected: invalid token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as User | undefined;
    this.logger.log(`Tracking disconnected: user=${user?.id ?? 'unknown'}`);
  }

  // Pipes registered via `useGlobalPipes` do not cover WebSocket gateway
  // message payloads, so the DTO is validated explicitly on the handler. This
  // is the security boundary that rejects NaN/Infinity/out-of-range coords.
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @SubscribeMessage('driver:location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UpdateLocationDto,
  ) {
    const user = client.data.user as User | undefined;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    // Only a driver may publish their own location. The driver identity is the
    // authenticated socket's user (never a client-supplied id), so Driver A can
    // never write Driver B's location.
    if (user.role !== UserRole.DRIVER) {
      client.emit('error', 'Only drivers can update their location');
      return;
    }

    await this.trackingService.updateLocation(
      user.id,
      payload.latitude,
      payload.longitude,
    );

    // Broadcast to the driver's room. Only subscribers who passed the
    // `canViewDriverLocation` authorization check are members of that room, so
    // this is scoped to the driver's own order viewers (customer + admin).
    void client.to(`user_${user.id}`).emit('driver:location:broadcast', {
      driverId: user.id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      updatedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('subscribe:driver')
  async handleSubscribeDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { driverId: number },
  ) {
    const user = client.data.user as User | undefined;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    const allowed = await this.trackingService.canViewDriverLocation(
      user,
      payload.driverId,
    );
    if (!allowed) {
      client.emit('error', 'Not allowed to subscribe to this driver');
      return;
    }

    void client.join(`user_${payload.driverId}`);
    client.emit('subscribed', { driverId: payload.driverId });
  }

  @SubscribeMessage('unsubscribe:driver')
  handleUnsubscribeDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { driverId: number },
  ) {
    void client.leave(`user_${payload.driverId}`);
    client.emit('unsubscribed', { driverId: payload.driverId });
  }
}
