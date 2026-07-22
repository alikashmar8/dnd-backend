import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async getAssignedOrders(driverId: number) {
    const orders = await this.orderRepository.find({
      where: { driverId },
      relations: {
        items: true,
        address: true,
        restaurant: true,
        customer: true,
      },
      order: { createdAt: 'DESC' },
    });

    return orders;
  }

  async updateOrderStatus(
    driverId: number,
    orderId: string,
    status: OrderStatus,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, driverId },
    });

    if (!order) {
      throw new NotFoundException('Order not found or not assigned to you');
    }

    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [],
      [OrderStatus.CONFIRMED]: [OrderStatus.OUT_FOR_DELIVERY],
      [OrderStatus.PREPARING]: [OrderStatus.OUT_FOR_DELIVERY],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    const allowedTransitions = validTransitions[order.status] || [];
    if (!allowedTransitions.includes(status)) {
      throw new BadRequestException(
        `Drivers can only transition from ${order.status} to ${status}`,
      );
    }

    order.status = status;
    await this.orderRepository.save(order);

    return await this.orderRepository.findOne({
      where: { id: orderId },
      relations: {
        items: true,
        address: true,
        restaurant: true,
        customer: true,
      },
    });
  }
}
