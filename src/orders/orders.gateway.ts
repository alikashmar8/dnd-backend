import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { Order } from './entities/order.entity';

/** Socket room shared by every connected member who can view all orders. */
export const ORDER_STAFF_ROOM = 'order_staff';

/** Roles that see every order in their list/detail views. */
const ORDER_STAFF_ROLES: UserRole[] = [
  UserRole.SUPERADMIN,
  UserRole.KITCHEN_HEAD,
  UserRole.WAREHOUSE_HEAD,
  UserRole.DRIVER_HEAD,
];

function isOrderStaffRole(role?: UserRole): boolean {
  return !!role && ORDER_STAFF_ROLES.includes(role);
}

/** Typed view of `client.data` so socket code stays type-safe (defaults to `any`). */
interface SocketUserData {
  user?: User;
}

/** A user relation with credential/collection fields stripped for the socket. */
interface SafeUser {
  id: number;
  email?: string;
  name: string;
  phone: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/** Order payload emitted to clients: every rendered field, no secrets. */
type OrderSocketPayload = Omit<
  Order,
  'customer' | 'createdBy' | 'driver' | 'kitchenUser' | 'warehouseUser'
> & {
  customer?: SafeUser | null;
  createdBy?: SafeUser | null;
  driver?: SafeUser | null;
  kitchenUser?: SafeUser | null;
  warehouseUser?: SafeUser | null;
};

@WebSocketGateway({ namespace: 'orders', cors: true })
@Injectable()
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token as string | undefined;

    if (!token) {
      this.logger.warn('Orders connection rejected: missing token');
      client.disconnect();
      return;
    }

    try {
      const user = await this.authService.validateUserByToken(token);
      client.data = { ...(client.data as SocketUserData), user };
      // Personal room so every order belonging to this user reaches them on
      // whichever screen they are currently viewing.
      await client.join(`user_${user.id}`);
      // Members who can view every order also join the shared staff room so a
      // single emit fans out to the whole order team.
      if (isOrderStaffRole(user.role)) {
        await client.join(ORDER_STAFF_ROOM);
      }
      this.logger.log(`Orders connected: user=${user.id} role=${user.role}`);
    } catch {
      this.logger.warn('Orders connection rejected: invalid token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as SocketUserData;
    this.logger.log(`Orders disconnected: user=${data.user?.id ?? 'unknown'}`);
  }

  /**
   * Pushes an order to everyone who may view it: the customer who owns it, the
   * shared staff room (superadmin + department heads), and any assigned driver
   * or kitchen/warehouse staff. Per-user rooms keep unrelated clients out; the
   * backend resolves the recipients from the order itself, so no client-side
   * filtering is ever trusted.
   */
  broadcastOrderUpdate(order: Order): void {
    const payload: OrderSocketPayload = this.sanitizeOrder(order);

    this.server.to(`user_${order.customerId}`).emit('order.updated', payload);
    this.server.to(ORDER_STAFF_ROOM).emit('order.updated', payload);
    if (order.driverId != null) {
      this.server.to(`user_${order.driverId}`).emit('order.updated', payload);
    }
    if (order.kitchenUserId != null) {
      this.server
        .to(`user_${order.kitchenUserId}`)
        .emit('order.updated', payload);
    }
    if (order.warehouseUserId != null) {
      this.server
        .to(`user_${order.warehouseUserId}`)
        .emit('order.updated', payload);
    }
  }

  /**
   * Strip sensitive fields (password hash, token-related data) from the user
   * relations before pushing an order over the socket. Socket payloads bypass
   * the HTTP serializer interceptor, so this keeps credentials out of clients.
   */
  private sanitizeOrder(order: Order): OrderSocketPayload {
    const safeUser = (user?: User | null): SafeUser | null | undefined => {
      if (!user) return user;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    };

    return {
      ...order,
      customer: safeUser(order.customer),
      createdBy: safeUser(order.createdBy),
      driver: safeUser(order.driver),
      kitchenUser: safeUser(order.kitchenUser),
      warehouseUser: safeUser(order.warehouseUser),
    };
  }
}
