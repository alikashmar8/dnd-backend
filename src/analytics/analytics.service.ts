import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { roundMoney } from '../common/constants/pricing';
import { OrderStatus } from '../enums/order-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { User } from '../users/entities/user.entity';
import { DateRangeDto } from './dto/date-range.dto';
import { ReportsQueryDto } from './dto/reports-query.dto';

/**
 * Statuses that count as a successfully completed sale. Mirrors the existing
 * business definition used by `getDriverStatistics` (delivered + completed are
 * the two terminal success states of the order state machine — a `delivered`
 * order has physically reached the customer; `completed` is SUPERADMIN's final
 * confirmation of that delivery). Cancelled/pending/in-flight orders are
 * intentionally excluded from revenue reporting.
 */
const COMPLETED_ORDER_STATUSES = [OrderStatus.DELIVERED, OrderStatus.COMPLETED];

/** Upper bound on a single report window, in days (covers a full year incl.
 * leap years). Guards against abusive `from=0001-01-01&to=9999-12-31` ranges. */
const MAX_REPORT_RANGE_DAYS = 366;

const EMPTY_REPORT = {
  completedOrders: 0,
  totalRevenue: 0,
  averageOrderValue: 0,
  totalItemsSold: 0,
  uniqueCustomers: 0,
  averageItemsPerOrder: 0,
};

interface ReportSummaryRow {
  completedOrders: string;
  totalRevenue: string;
  averageOrderValue: string;
  uniqueCustomers: string;
}

interface ReportItemsSoldRow {
  totalItemsSold: string;
}

interface ReportSeriesRow {
  date: string;
  orderCount: string;
  revenue: string;
}

interface ReportTopItemRow {
  itemId: string;
  itemType: string;
  itemName: string;
  itemNameAr: string | null;
  quantitySold: string;
  revenue: string;
}

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
    /* Raw-select aliases go through the two-argument form so TypeORM quotes
     * them — unquoted `as camelCase` gets case-folded by Postgres and every
     * mapped field below would read undefined. Same for TO_CHAR vs DATE():
     * the pg driver parses DATE() into a timezone-shifted JS Date. */
    const dayExpr = "TO_CHAR(order.createdAt, 'YYYY-MM-DD')";
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .select(dayExpr, 'date')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('SUM(order.total)', 'totalRevenue')
      .addSelect('SUM(order.subtotal)', 'subtotalRevenue')
      .addSelect('SUM(order.tax)', 'totalTax')
      .addSelect('SUM(order.deliveryFee)', 'totalDeliveryFee')
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
      .groupBy(dayExpr)
      .orderBy(dayExpr, 'DESC')
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
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(order.total)', 'totalRevenue');

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
      .select('orderItem.name', 'itemName')
      .addSelect('orderItem.itemType', 'itemType')
      .addSelect('SUM(orderItem.quantity)', 'totalQuantity')
      .addSelect('SUM(orderItem.price * orderItem.quantity)', 'totalRevenue')
      .addSelect('COUNT(DISTINCT order.id)', 'orderCount')
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
      .getRawMany<{
        itemName: string;
        itemType: string;
        totalQuantity: string;
        totalRevenue: string;
        orderCount: string;
      }>();

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
      .select('COUNT(*)', 'orderCount')
      .addSelect('SUM(order.total)', 'totalRevenue')
      .addSelect('AVG(order.total)', 'averageOrderValue')
      .andWhere('order.status != :cancelled', {
        cancelled: OrderStatus.CANCELLED,
      });

    if (dateRange?.startDate && dateRange?.endDate) {
      query.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(dateRange.startDate),
        endDate: new Date(dateRange.endDate),
      });
    }

    const result = await query.getRawOne<{
      orderCount: string;
      totalRevenue: string;
      averageOrderValue: string;
    }>();

    return {
      orderCount: Number(result?.orderCount || 0),
      totalRevenue: Number(result?.totalRevenue || 0),
      averageOrderValue: Number(result?.averageOrderValue || 0),
    };
  }

  async getDriverStatistics(dateRange?: DateRangeDto) {
    const driverQuery = this.orderRepository
      .createQueryBuilder('order')
      .leftJoin('order.driver', 'driver')
      .select('driver.id', 'driverId')
      .addSelect('driver.name', 'driverName')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('SUM(order.total)', 'totalRevenue')
      .addSelect('AVG(order.total)', 'averageOrderValue')
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
      .getRawMany<{
        driverId: number | null;
        driverName: string | null;
        orderCount: string;
        totalRevenue: string;
        averageOrderValue: string;
      }>();

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
      .select('COUNT(DISTINCT order.customerId)', 'activeUsers');

    if (dateRange?.startDate && dateRange?.endDate) {
      activeUsersQuery.andWhere(
        'order.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(dateRange.startDate),
          endDate: new Date(dateRange.endDate),
        },
      );
    }

    const activeUsersResult = await activeUsersQuery.getRawOne<{
      activeUsers: string;
    }>();
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

  /**
   * Completed-orders / sales report for a date range. All heavy lifting is done
   * by the database (COUNT/SUM/AVG/GROUP BY with LIMIT/OFFSET) — no orders or
   * order items are ever loaded into application memory.
   *
   * Date semantics: `startDate`/`endDate` are UTC calendar days. The effective
   * window is `[startOf(startDate), startOf(endDate + 1 day))`, i.e. an
   * exclusive upper bound that includes the whole `endDate` day. Filtering is
   * applied in SQL on `order.createdAt` (the existing analytics timestamp).
   *
   * Financial meaning: "Total Revenue" is the SUM of the stored authoritative
   * `orders.total` (subtotal + tax + flat delivery fee as snapshotted at
   * checkout) for completed orders. Item revenue uses the historical
   * `order_items.price` snapshot — never today's catalog price.
   */
  async getOrderReports(query: ReportsQueryDto) {
    const { from, to } = this.resolveReportDateRange(query);
    const statuses = COMPLETED_ORDER_STATUSES;
    const take = query.take ?? 20;
    const skip = query.skip ?? 0;

    const topItemsCountSub = this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .select('orderItem.itemId')
      .where('order.status IN (:...statuses)', { statuses })
      .andWhere('order.createdAt >= :from', { from })
      .andWhere('order.createdAt < :to', { to })
      .groupBy(
        'orderItem.itemId, orderItem.itemType, orderItem.name, orderItem.nameAr',
      );

    /* Aliases are passed via the two-argument select()/addSelect() form so that
     * TypeORM quotes them (`AS "completedOrders"`). Unquoted aliases would be
     * case-folded to lowercase by Postgres and break the raw-row mapping. The
     * series buckets use TO_CHAR so rows carry a plain `YYYY-MM-DD` string —
     * DATE() is parsed into a timezone-shifted JS Date by the pg driver. */
    const [
      summaryRow,
      itemsSoldRow,
      seriesRows,
      topItemsRows,
      topItemsTotalRow,
    ] = await Promise.all([
      this.orderRepository
        .createQueryBuilder('order')
        .select('COUNT(*)', 'completedOrders')
        .addSelect('COALESCE(SUM(order.total), 0)', 'totalRevenue')
        .addSelect('COALESCE(AVG(order.total), 0)', 'averageOrderValue')
        .addSelect('COUNT(DISTINCT order.customerId)', 'uniqueCustomers')
        .where('order.status IN (:...statuses)', { statuses })
        .andWhere('order.createdAt >= :from', { from })
        .andWhere('order.createdAt < :to', { to })
        .getRawOne<ReportSummaryRow>(),
      this.orderItemRepository
        .createQueryBuilder('orderItem')
        .select('COALESCE(SUM(orderItem.quantity), 0)', 'totalItemsSold')
        .innerJoin('orderItem.order', 'order')
        .where('order.status IN (:...statuses)', { statuses })
        .andWhere('order.createdAt >= :from', { from })
        .andWhere('order.createdAt < :to', { to })
        .getRawOne<ReportItemsSoldRow>(),
      this.orderRepository
        .createQueryBuilder('order')
        .select("TO_CHAR(order.createdAt, 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'orderCount')
        .addSelect('SUM(order.total)', 'revenue')
        .where('order.status IN (:...statuses)', { statuses })
        .andWhere('order.createdAt >= :from', { from })
        .andWhere('order.createdAt < :to', { to })
        .groupBy("TO_CHAR(order.createdAt, 'YYYY-MM-DD')")
        .orderBy("TO_CHAR(order.createdAt, 'YYYY-MM-DD')", 'ASC')
        .getRawMany<ReportSeriesRow>(),
      this.orderItemRepository
        .createQueryBuilder('orderItem')
        .innerJoin('orderItem.order', 'order')
        .select('orderItem.itemId', 'itemId')
        .addSelect('orderItem.itemType', 'itemType')
        .addSelect('orderItem.name', 'itemName')
        .addSelect('orderItem.nameAr', 'itemNameAr')
        .addSelect('SUM(orderItem.quantity)', 'quantitySold')
        .addSelect('SUM(orderItem.price * orderItem.quantity)', 'revenue')
        .where('order.status IN (:...statuses)', { statuses })
        .andWhere('order.createdAt >= :from', { from })
        .andWhere('order.createdAt < :to', { to })
        .groupBy(
          'orderItem.itemId, orderItem.itemType, orderItem.name, orderItem.nameAr',
        )
        .orderBy('SUM(orderItem.quantity)', 'DESC')
        .addOrderBy('SUM(orderItem.price * orderItem.quantity)', 'DESC')
        .limit(take)
        .offset(skip)
        .getRawMany<ReportTopItemRow>(),
      /* Alias-less manager builder: a repository builder would emit its own
       * table next to the sub-select and cross-join it, inflating COUNT(*). */
      this.orderItemRepository.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'total')
        .from(`(${topItemsCountSub.getQuery()})`, 'sub')
        .setParameters(topItemsCountSub.getParameters())
        .getRawOne<{ total: string }>(),
    ]);

    const summary = { ...EMPTY_REPORT };
    if (summaryRow) {
      const completedOrders = Number(summaryRow.completedOrders ?? 0);
      const totalRevenue = Number(summaryRow.totalRevenue ?? 0);
      summary.completedOrders = completedOrders;
      summary.totalRevenue = roundMoney(totalRevenue);
      summary.averageOrderValue = roundMoney(
        Number(summaryRow.averageOrderValue ?? 0),
      );
      summary.uniqueCustomers = Number(summaryRow.uniqueCustomers ?? 0);
      summary.totalItemsSold = Number(itemsSoldRow?.totalItemsSold ?? 0);
      summary.averageItemsPerOrder =
        completedOrders > 0
          ? Number((summary.totalItemsSold / completedOrders).toFixed(2))
          : 0;
    }

    return {
      summary,
      series: (seriesRows ?? []).map((row) => ({
        date: row.date,
        orderCount: Number(row.orderCount ?? 0),
        revenue: roundMoney(Number(row.revenue ?? 0)),
      })),
      topItems: {
        items: (topItemsRows ?? []).map((row) => ({
          itemId: row.itemId,
          itemType: row.itemType,
          itemName: row.itemName,
          itemNameAr: row.itemNameAr ?? null,
          quantitySold: Number(row.quantitySold ?? 0),
          revenue: roundMoney(Number(row.revenue ?? 0)),
        })),
        total: Number(topItemsTotalRow?.total ?? 0),
        skip,
        take,
      },
      dateRange: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };
  }

  /** Converts `YYYY-MM-DD` calendar days into the UTC half-open window
   * `[startOf(startDate), startOf(endDate + 1 day))` and validates it. */
  private resolveReportDateRange(query: ReportsQueryDto) {
    const from = new Date(`${query.startDate}T00:00:00.000Z`);
    const to = new Date(`${query.endDate}T00:00:00.000Z`);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException(
        'startDate and endDate must be valid calendar dates',
      );
    }

    to.setUTCDate(to.getUTCDate() + 1);

    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    const days = (to.getTime() - from.getTime()) / 86_400_000;
    if (days > MAX_REPORT_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range must not exceed ${MAX_REPORT_RANGE_DAYS} days`,
      );
    }

    return { from, to };
  }
}
