import { Injectable, Logger } from '@nestjs/common';
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
import { TrackingService } from './tracking.service';
import { User } from '../users/entities/user.entity';

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
      void client.join(`user_${user.id}`);
      this.logger.log(`Tracking connected: user=${user.id} role=${user.role}`);
    } catch {
      this.logger.warn('Tracking connection rejected: invalid token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as User | undefined;
    this.logger.log(`Tracking disconnected: user=${user?.id ?? 'unknown'}`);
  }

  @SubscribeMessage('driver:location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { latitude: number; longitude: number },
  ) {
    const user = client.data.user as User | undefined;
    if (!user) {
      client.emit('error', 'Unauthorized');
      return;
    }

    await this.trackingService.updateLocation(
      user.id,
      payload.latitude,
      payload.longitude,
    );

    void client.to(`user_${user.id}`).emit('driver:location:broadcast', {
      driverId: user.id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      updatedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('subscribe:driver')
  handleSubscribeDriver(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { driverId: number },
  ) {
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
