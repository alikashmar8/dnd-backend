import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { User } from '../users/entities/user.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { DateRangeDto } from './dto/date-range.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(ShopItem)
    private readonly shopItemRepository: Repository<ShopItem>,
  ) {}

  async getRevenueMetrics(dateRange?: DateRangeDto) {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .select([
        'DATE(order.createdAt) as date',
        'COUNT(*) as orderCount',
        'SUM(order.total) as totalRevenue',
        'SUM(order.subtotal) as subtotalRevenue',
        'SUM(order.tax) as totalTax',
        'SUM(order.deliveryFee) as totalDeliveryFee',
      ])
      .where('order.status != :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      });

    if (dateRange?.startDate && dateRange?.endDate) {
      queryBuilder.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      });
    }

    const results = await queryBuilder
      .groupBy('DATE(order.createdAt)')
      .orderBy('DATE(order.createdAt)', 'DESC')
      .getRawMany<{ date: string; orderCount: string; totalRevenue: string }>();

    const totalRevenue = results.reduce(
      (sum, row) => sum + Number(row.totalRevenue || 0),
      0,
    );
    const totalOrders = results.reduce(
      (sum, row) => sum + Number(row.orderCount || 0),
      0,
    );

    return {
      daily: results,
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
    };
  }

  async getOrderStatistics(dateRange?: DateRangeDto) {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .select([
        'order.status as status',
        'COUNT(*) as count',
        'SUM(order.total) as totalRevenue',
      ]);

    if (dateRange?.startDate && dateRange?.endDate) {
      queryBuilder.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      });
    }

    const results = await queryBuilder.groupBy('order.status').getRawMany<{
      status: OrderStatus;
      count: string;
      totalRevenue: string;
    }>();

    const statusMap: Record<string, { count: number; totalRevenue: number }> =
      {};
    Object.values(OrderStatus).forEach((status) => {
      statusMap[status] = { count: 0, totalRevenue: 0 };
    });

    results.forEach((row) => {
      statusMap[row.status] = {
        count: Number(row.count || 0),
        totalRevenue: Number(row.totalRevenue || 0),
      };
    });

    const totalOrders = Object.values(statusMap).reduce(
      (sum, stat) => sum + stat.count,
      0,
    );

    return {
      byStatus: statusMap,
      totalOrders,
    };
  }

  async getTopCategories(dateRange?: DateRangeDto, limit: number = 10) {
    const orderItemQuery = this.orderItemRepository
      .createQueryBuilder('orderItem')
      .leftJoin('orderItem.order', 'order')
      .select([
        'orderItem.name as itemName',
        'orderItem.itemType as itemType',
        'SUM(orderItem.quantity) as totalQuantity',
        'SUM(orderItem.price * orderItem.quantity) as totalRevenue',
        'COUNT(DISTINCT order.id) as orderCount',
      ])
      .where('order.status != :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      });

    if (dateRange?.startDate && dateRange?.endDate) {
      orderItemQuery.andWhere(
        'order.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(dateRange.startDate),
          endDate: new Date(dateRange.endDate),
        },
      );
    }

    const results = await orderItemQuery
      .groupBy('orderItem.name, orderItem.itemType')
      .orderBy('SUM(orderItem.quantity)', 'DESC')
      .limit(limit)
      .getRawMany();

    return results.map((row) => ({
      itemName: row.itemName,
      itemType: row.itemType,
      totalQuantity: Number(row.totalQuantity || 0),
      totalRevenue: Number(row.totalRevenue || 0),
      orderCount: Number(row.orderCount || 0),
    }));
  }

  async getMerchantStatistics(dateRange?: DateRangeDto) {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .select([
        'COUNT(*) as orderCount',
        'SUM(order.total) as totalRevenue',
        'AVG(order.total) as averageOrderValue',
      ])
      .andWhere('order.status != :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      });

    if (dateRange?.startDate && dateRange?.endDate) {
      query.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      });
    }

    const results = await query.getRawMany();

    return {
      orderCount: Number(results[0]?.orderCount || 0),
      totalRevenue: Number(results[0]?.totalRevenue || 0),
      averageOrderValue: Number(results[0]?.averageOrderValue || 0),
    };
  }

  async getDriverStatistics(dateRange?: DateRangeDto) {
    const driverQuery = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.driver', 'driver')
      .select([
        'driver.id as driverId',
        'driver.name as driverName',
        'COUNT(*) as orderCount',
        'SUM(order.total) as totalRevenue',
        'AVG(order.total) as averageOrderValue',
      ])
      .where('order.status IN (:...statuses)', {
        statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED],
      });

    if (dateRange?.startDate && dateRange?.endDate) {
      driverQuery.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      });
    }

    const results = await driverQuery
      .groupBy('driver.id, driver.name')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();

    return results.map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      orderCount: Number(row.orderCount || 0),
      totalRevenue: Number(row.totalRevenue || 0),
      averageOrderValue: Number(row.averageOrderValue || 0),
    }));
  }

  async getUserStatistics(dateRange?: DateRangeDto) {
    const totalUsers = await this.userRepository.count({
      where: { role: UserRole.CUSTOMER },
    });

    const activeUsersQuery = this.orderRepository
      .createQueryBuilder('order')
      .select(['COUNT(DISTINCT order.customerId) as activeUsers']);

    if (dateRange?.startDate && dateRange?.endDate) {
      activeUsersQuery.andWhere(
        'order.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(dateRange.startDate),
          endDate: new Date(dateRange.endDate),
        },
      );
    }

    const activeUsersResult = await activeUsersQuery.getRawOne();
    const activeUsers = Number(activeUsersResult?.activeUsers || 0);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
    };
  }

  async getOverview(dateRange?: DateRangeDto) {
    const [
      revenue,
      orders,
      users,
      merchants,
      drivers,
      totalRestaurants,
      totalMenuItems,
      totalShopItems,
      totalDrivers,
    ] = await Promise.all([
      this.getRevenueMetrics(dateRange),
      this.getOrderStatistics(dateRange),
      this.getUserStatistics(dateRange),
      this.getMerchantStatistics(dateRange),
      this.getDriverStatistics(dateRange),
      this.restaurantRepository.count(),
      this.menuItemRepository.count(),
      this.shopItemRepository.count(),
      this.userRepository.count({ where: { role: UserRole.DRIVER } }),
    ]);

    // Canonical dashboard-facing shape: flat totals + the time/status series
    // the admin dashboard renders, alongside the richer nested metrics.
    const totals = {
      totalOrders: orders.totalOrders,
      totalRevenue: revenue.summary.totalRevenue,
      totalUsers: users.totalUsers,
      totalRestaurants,
      totalDrivers,
      totalMenuItems,
      totalShopItems,
    };

    const revenueByDay = (revenue.daily || []).map((row) => ({
      date: row.date,
      revenue: Number(row.totalRevenue || 0),
    }));

    const ordersByStatus = Object.entries(orders.byStatus).map(
      ([status, stat]) => ({
        status,
        count: Number(stat.count || 0),
      }),
    );

    return {
      totals,
      revenueByDay,
      ordersByStatus,
      revenue,
      orders,
      users,
      merchants,
      drivers,
    };
  }
}
