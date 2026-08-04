import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../enums/user-role.enum';
import { Address } from '../../addresses/entities/address.entity';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';
import { MenuCategory } from '../../menu/entities/menu-category.entity';
import { MenuItem } from '../../menu/entities/menu-item.entity';
import { ShopItem } from '../../shop-items/entities/shop-item.entity';
import { ShopCategory } from '../../shop-items/entities/shop-category.entity';
import { Order } from '../../orders/entities/order.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';
import { OrderStatus } from '../../enums/order-status.enum';
import { MealType } from '../../enums/meal-type.enum';
import { Ad } from '../../ads/entities/ad.entity';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(MenuCategory)
    private readonly menuCategoryRepository: Repository<MenuCategory>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(ShopItem)
    private readonly shopItemRepository: Repository<ShopItem>,
    @InjectRepository(ShopCategory)
    private readonly shopCategoryRepository: Repository<ShopCategory>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Ad)
    private readonly adRepository: Repository<Ad>,
  ) {}

  async seed() {
    console.log('Starting database seeding...');

    // Clear existing data using DELETE to avoid PostgreSQL TRUNCATE foreign key restrictions.
    await this.orderItemRepository.createQueryBuilder().delete().execute();
    await this.orderRepository.createQueryBuilder().delete().execute();
    await this.menuItemRepository.createQueryBuilder().delete().execute();
    await this.menuCategoryRepository.createQueryBuilder().delete().execute();
    await this.shopItemRepository.createQueryBuilder().delete().execute();
    await this.shopCategoryRepository.createQueryBuilder().delete().execute();
    await this.restaurantRepository.createQueryBuilder().delete().execute();
    await this.addressRepository.createQueryBuilder().delete().execute();
    await this.userRepository.createQueryBuilder().delete().execute();

    // Seed Users
    const hashedPassword = await bcrypt.hash('12345678', 10);

    const customer = this.userRepository.create({
      email: 'customer@example.com',
      passwordHash: hashedPassword,
      name: 'John Doe',
      phone: '+96176666666',
      role: UserRole.CUSTOMER,
    });

    const driver = this.userRepository.create({
      email: 'driver@example.com',
      passwordHash: hashedPassword,
      name: 'Bob Johnson',
      phone: '+96171111111',
      role: UserRole.DRIVER,
    });

    const superadmin = this.userRepository.create({
      email: 'superadmin@example.com',
      passwordHash: hashedPassword,
      name: 'Super Admin',
      phone: '+96170000000',
      role: UserRole.SUPERADMIN,
    });

    const kitchenHead = this.userRepository.create({
      email: 'kitchen-head@example.com',
      passwordHash: hashedPassword,
      name: 'Chef Head',
      phone: '+96175555555',
      role: UserRole.KITCHEN_HEAD,
    });

    const warehouseHead = this.userRepository.create({
      email: 'warehouse-head@example.com',
      passwordHash: hashedPassword,
      name: 'Stock Manager',
      phone: '+96176666660',
      role: UserRole.WAREHOUSE_HEAD,
    });

    const driverHead = this.userRepository.create({
      email: 'driver-head@example.com',
      passwordHash: hashedPassword,
      name: 'Fleet Manager',
      phone: '+96177777777',
      role: UserRole.DRIVER_HEAD,
    });

    const kitchenStaff = this.userRepository.create({
      email: 'kitchen-staff@example.com',
      passwordHash: hashedPassword,
      name: 'Kitchen Staff Member',
      phone: '+96178888888',
      role: UserRole.KITCHEN_STAFF,
    });

    const warehouseStaff = this.userRepository.create({
      email: 'warehouse-staff@example.com',
      passwordHash: hashedPassword,
      name: 'Warehouse Staff Member',
      phone: '+96179999999',
      role: UserRole.WAREHOUSE_STAFF,
    });

    await this.userRepository.save([
      customer,
      driver,
      superadmin,
      kitchenHead,
      warehouseHead,
      driverHead,
      kitchenStaff,
      warehouseStaff,
    ]);
    console.log('✓ Users seeded');

    // Seed Addresses
    const address1 = this.addressRepository.create({
      userId: customer.id,
      title: 'Home',
      city: 'New York',
      street: '123 Main Street',
      description: 'Ring doorbell twice',
      latitude: 40.7128,
      longitude: -74.006,
    });

    const address2 = this.addressRepository.create({
      userId: customer.id,
      title: 'Work',
      city: 'New York',
      street: '456 Business Ave',
      description: 'Leave with reception',
      latitude: 40.7589,
      longitude: -73.9851,
    });

    const restaurantAddress = this.addressRepository.create({
      userId: superadmin.id,
      title: 'Restaurant Location',
      city: 'New York',
      street: '789 Restaurant Street',
      description: 'Main restaurant location',
      latitude: 40.758,
      longitude: -73.9855,
    });

    await this.addressRepository.save([address1, address2, restaurantAddress]);
    console.log('✓ Addresses seeded');

    // Seed Restaurants
    const restaurant1 = this.restaurantRepository.create({
      address: restaurantAddress,
      name: 'Pizza Palace',
      mealType: MealType.FAST_FOOD,
      logoImage: 'https://example.com/pizza-logo.jpg',
      rating: 4.5,
      deliveryMinutes: 30,
      priceLevel: '$$',
      tags: ['pizza', 'italian', 'delivery'],
      isActive: true,
    });

    const restaurant2 = this.restaurantRepository.create({
      address: restaurantAddress,
      name: 'Healthy Bites',
      mealType: MealType.HOMEMADE,
      logoImage: 'https://example.com/healthy-logo.jpg',
      rating: 4.8,
      deliveryMinutes: 45,
      priceLevel: '$$$',
      tags: ['healthy', 'organic', 'homemade'],
      isActive: true,
    });

    await this.restaurantRepository.save([restaurant1, restaurant2]);
    console.log('✓ Restaurants seeded');

    // Seed Menu Categories (shared, multi-level)
    const category1 = this.menuCategoryRepository.create({
      name: 'Pizzas',
      sortOrder: 1,
      image: 'https://example.com/pizzas.jpg',
      parentId: null,
    });

    const category2 = this.menuCategoryRepository.create({
      name: 'Sides',
      sortOrder: 2,
      image: 'https://example.com/sides.jpg',
      parentId: null,
    });

    const category3 = this.menuCategoryRepository.create({
      name: 'Main Courses',
      sortOrder: 3,
      image: 'https://example.com/main-courses.jpg',
      parentId: null,
    });

    await this.menuCategoryRepository.save([category1, category2, category3]);

    const category1Child = this.menuCategoryRepository.create({
      name: 'Specialty Pizzas',
      sortOrder: 1,
      image: 'https://example.com/specialty-pizzas.jpg',
      parentId: category1.id,
    });

    const category3Child = this.menuCategoryRepository.create({
      name: 'Seafood',
      sortOrder: 1,
      image: 'https://example.com/seafood.jpg',
      parentId: category3.id,
    });

    await this.menuCategoryRepository.save([category1Child, category3Child]);
    console.log('✓ Menu categories seeded');

    // Seed Menu Items
    const menuItem1 = this.menuItemRepository.create({
      categoryId: category1Child.id,
      name: 'Margherita Pizza',
      description: 'Classic tomato and mozzarella pizza',
      price: 12.99,
      image: 'https://example.com/margherita.jpg',
      available: true,
      prepTimeMinutes: 20,
      restaurantId: restaurant1.id,
    });

    const menuItem2 = this.menuItemRepository.create({
      categoryId: category1Child.id,
      name: 'Pepperoni Pizza',
      description: 'Pepperoni and cheese pizza',
      price: 14.99,
      image: 'https://example.com/pepperoni.jpg',
      available: true,
      prepTimeMinutes: 20,
      restaurantId: restaurant1.id,
    });

    const menuItem3 = this.menuItemRepository.create({
      categoryId: category2.id,
      name: 'Garlic Bread',
      description: 'Fresh garlic bread with herbs',
      price: 4.99,
      image: 'https://example.com/garlic-bread.jpg',
      available: true,
      prepTimeMinutes: 10,
      restaurantId: null,
    });

    const menuItem4 = this.menuItemRepository.create({
      categoryId: category3Child.id,
      name: 'Grilled Salmon',
      description: 'Fresh grilled salmon with vegetables',
      price: 18.99,
      image: 'https://example.com/salmon.jpg',
      available: true,
      prepTimeMinutes: 25,
      restaurantId: restaurant2.id,
    });

    await this.menuItemRepository.save([
      menuItem1,
      menuItem2,
      menuItem3,
      menuItem4,
    ]);
    console.log('✓ Menu items seeded');

    // Seed Shop Categories (multi-level)
    const shopCategory1 = this.shopCategoryRepository.create({
      name: 'Dairy',
      image: 'https://example.com/dairy.jpg',
      sortOrder: 1,
      parentId: null,
    });

    const shopCategory2 = this.shopCategoryRepository.create({
      name: 'Bakery',
      image: 'https://example.com/bakery.jpg',
      sortOrder: 2,
      parentId: null,
    });

    const shopCategory3 = this.shopCategoryRepository.create({
      name: 'Fruits',
      image: 'https://example.com/fruits.jpg',
      sortOrder: 3,
      parentId: null,
    });

    await this.shopCategoryRepository.save([
      shopCategory1,
      shopCategory2,
      shopCategory3,
    ]);

    const shopCategory1Child = this.shopCategoryRepository.create({
      name: 'Milk & Eggs',
      image: 'https://example.com/milk-eggs.jpg',
      sortOrder: 1,
      parentId: shopCategory1.id,
    });

    const shopCategory3Child = this.shopCategoryRepository.create({
      name: 'Citrus',
      image: 'https://example.com/citrus.jpg',
      sortOrder: 1,
      parentId: shopCategory3.id,
    });

    await this.shopCategoryRepository.save([
      shopCategory1Child,
      shopCategory3Child,
    ]);
    console.log('✓ Shop categories seeded');

    // Seed Shop Items
    const shopItem1 = this.shopItemRepository.create({
      categoryId: shopCategory1Child.id,
      name: 'Organic Milk',
      description: 'Fresh organic whole milk',
      price: 4.99,
      image: 'https://example.com/milk.jpg',
      stockQuantity: 50,
      unit: 'gallon',
    });

    const shopItem2 = this.shopItemRepository.create({
      categoryId: shopCategory2.id,
      name: 'Whole Wheat Bread',
      description: 'Fresh whole wheat bread',
      price: 3.49,
      image: 'https://example.com/bread.jpg',
      stockQuantity: 30,
      unit: 'loaf',
    });

    const shopItem3 = this.shopItemRepository.create({
      categoryId: shopCategory1Child.id,
      name: 'Fresh Eggs',
      description: 'Farm fresh eggs (dozen)',
      price: 5.99,
      image: 'https://example.com/eggs.jpg',
      stockQuantity: 40,
      unit: 'dozen',
    });

    const shopItem4 = this.shopItemRepository.create({
      categoryId: shopCategory3Child.id,
      name: 'Organic Apples',
      description: 'Fresh organic apples',
      price: 6.99,
      image: 'https://example.com/apples.jpg',
      stockQuantity: 25,
      unit: 'lb',
    });

    await this.shopItemRepository.save([
      shopItem1,
      shopItem2,
      shopItem3,
      shopItem4,
    ]);
    console.log('✓ Shop items seeded');

    // ── Seed Orders ──────────────────────────────────────────

    const order1 = this.orderRepository.create({
      id: 'ORD-20260701-001',
      customerId: customer.id,
      status: OrderStatus.PENDING,
      addressId: address1.id,
      etaMinutes: 35,
      subtotal: 27.98,
      tax: 1.4,
      deliveryFee: 7,
      total: 36.38,
      placedAt: new Date('2026-07-01T10:30:00Z'),
    });

    const order2 = this.orderRepository.create({
      id: 'ORD-20260701-002',
      customerId: customer.id,
      status: OrderStatus.CONFIRMED,
      addressId: address1.id,
      etaMinutes: 35,
      subtotal: 18.99,
      tax: 0.95,
      deliveryFee: 7,
      total: 26.94,
      placedAt: new Date('2026-07-01T12:00:00Z'),
    });

    const order3 = this.orderRepository.create({
      id: 'ORD-20260702-001',
      customerId: customer.id,
      status: OrderStatus.PREPARING,
      driverId: driver.id,
      kitchenUserId: kitchenStaff.id,
      kitchenAssignedAt: new Date('2026-07-02T18:05:00Z'),
      addressId: address2.id,
      etaMinutes: 35,
      subtotal: 32.97,
      tax: 1.65,
      deliveryFee: 7,
      total: 41.62,
      placedAt: new Date('2026-07-02T18:00:00Z'),
    });

    const order4 = this.orderRepository.create({
      id: 'ORD-20260702-002',
      customerId: customer.id,
      status: OrderStatus.IN_ROUTE,
      driverId: driver.id,
      kitchenUserId: kitchenStaff.id,
      kitchenAssignedAt: new Date('2026-07-02T19:05:00Z'),
      kitchenPreparedAt: new Date('2026-07-02T19:30:00Z'),
      addressId: address1.id,
      etaMinutes: 35,
      subtotal: 23.98,
      tax: 1.2,
      deliveryFee: 7,
      total: 32.18,
      placedAt: new Date('2026-07-02T19:00:00Z'),
    });

    const order5 = this.orderRepository.create({
      id: 'ORD-20260703-001',
      customerId: customer.id,
      status: OrderStatus.DELIVERED,
      driverId: driver.id,
      addressId: address2.id,
      etaMinutes: 45,
      subtotal: 15.47,
      tax: 0.77,
      deliveryFee: 5,
      total: 21.24,
      placedAt: new Date('2026-07-03T09:00:00Z'),
    });

    const order6 = this.orderRepository.create({
      id: 'ORD-20260703-002',
      customerId: customer.id,
      status: OrderStatus.COMPLETED,
      driverId: driver.id,
      addressId: address1.id,
      etaMinutes: 35,
      subtotal: 42.97,
      tax: 2.15,
      deliveryFee: 7,
      total: 52.12,
      placedAt: new Date('2026-07-03T13:00:00Z'),
    });

    const order7 = this.orderRepository.create({
      id: 'ORD-20260704-001',
      customerId: customer.id,
      status: OrderStatus.CANCELLED,
      addressId: address1.id,
      etaMinutes: 45,
      subtotal: 8.98,
      tax: 0.45,
      deliveryFee: 5,
      total: 14.43,
      placedAt: new Date('2026-07-04T08:00:00Z'),
    });

    await this.orderRepository.save([
      order1,
      order2,
      order3,
      order4,
      order5,
      order6,
      order7,
    ]);
    console.log('✓ Orders seeded');

    // Seed Order Items
    const order1Items = this.orderItemRepository.create([
      {
        orderId: order1.id,
        itemId: menuItem1.id.toString(),
        itemType: 'menu',
        name: menuItem1.name,
        price: menuItem1.price,
        quantity: 1,
        image: menuItem1.image,
      },
      {
        orderId: order1.id,
        itemId: menuItem2.id.toString(),
        itemType: 'menu',
        name: menuItem2.name,
        price: menuItem2.price,
        quantity: 1,
        image: menuItem2.image,
      },
    ]);

    const order2Items = this.orderItemRepository.create([
      {
        orderId: order2.id,
        itemId: menuItem4.id.toString(),
        itemType: 'menu',
        name: menuItem4.name,
        price: menuItem4.price,
        quantity: 1,
        image: menuItem4.image,
      },
    ]);

    const order3Items = this.orderItemRepository.create([
      {
        orderId: order3.id,
        itemId: menuItem1.id.toString(),
        itemType: 'menu',
        name: menuItem1.name,
        price: menuItem1.price,
        quantity: 2,
        image: menuItem1.image,
      },
      {
        orderId: order3.id,
        itemId: menuItem3.id.toString(),
        itemType: 'menu',
        name: menuItem3.name,
        price: menuItem3.price,
        quantity: 1,
        image: menuItem3.image,
      },
    ]);

    const order4Items = this.orderItemRepository.create([
      {
        orderId: order4.id,
        itemId: menuItem3.id.toString(),
        itemType: 'menu',
        name: menuItem3.name,
        price: menuItem3.price,
        quantity: 2,
        image: menuItem3.image,
      },
      {
        orderId: order4.id,
        itemId: menuItem4.id.toString(),
        itemType: 'menu',
        name: menuItem4.name,
        price: menuItem4.price,
        quantity: 1,
        image: menuItem4.image,
      },
    ]);

    const order5Items = this.orderItemRepository.create([
      {
        orderId: order5.id,
        itemId: shopItem1.id.toString(),
        itemType: 'shop',
        name: shopItem1.name,
        price: shopItem1.price,
        quantity: 2,
        image: shopItem1.image,
      },
      {
        orderId: order5.id,
        itemId: shopItem2.id.toString(),
        itemType: 'shop',
        name: shopItem2.name,
        price: shopItem2.price,
        quantity: 1,
        image: shopItem2.image,
      },
    ]);

    const order6Items = this.orderItemRepository.create([
      {
        orderId: order6.id,
        itemId: menuItem1.id.toString(),
        itemType: 'menu',
        name: menuItem1.name,
        price: menuItem1.price,
        quantity: 1,
        image: menuItem1.image,
      },
      {
        orderId: order6.id,
        itemId: menuItem2.id.toString(),
        itemType: 'menu',
        name: menuItem2.name,
        price: menuItem2.price,
        quantity: 2,
        image: menuItem2.image,
      },
    ]);

    const order7Items = this.orderItemRepository.create([
      {
        orderId: order7.id,
        itemId: shopItem3.id.toString(),
        itemType: 'shop',
        name: shopItem3.name,
        price: shopItem3.price,
        quantity: 1,
        image: shopItem3.image,
      },
      {
        orderId: order7.id,
        itemId: shopItem4.id.toString(),
        itemType: 'shop',
        name: shopItem4.name,
        price: shopItem4.price,
        quantity: 1,
        image: shopItem4.image,
      },
    ]);

    await this.orderItemRepository.save([
      ...order1Items,
      ...order2Items,
      ...order3Items,
      ...order4Items,
      ...order5Items,
      ...order6Items,
      ...order7Items,
    ]);
    console.log('✓ Order items seeded');

    // Seed Ads
    const ad1 = this.adRepository.create({
      title: 'Weekend Feast Deals',
      subtitle: 'Up to 30% off on curated homemade platters',
      image:
        'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1200&q=80',
      sortOrder: 1,
      isActive: true,
    });

    const ad2 = this.adRepository.create({
      title: 'Fresh Market Restock',
      subtitle: 'Organic produce delivered in under 45 minutes',
      image:
        'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
      sortOrder: 2,
      isActive: true,
    });

    const ad3 = this.adRepository.create({
      title: 'Midnight Cravings',
      subtitle:
        'Late-night comfort meals and sweet bites, still hot on arrival',
      image:
        'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80',
      sortOrder: 3,
      isActive: true,
    });

    await this.adRepository.save([ad1, ad2, ad3]);
    console.log('✓ Ads seeded');

    console.log('Database seeding completed successfully!');
  }
}
