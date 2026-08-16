/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { CartService } from './cart.service';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { OrdersService } from '../orders/orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';

const mockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  createQueryBuilder: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
});

describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<Repository<Cart>>;
  let cartItemRepository: jest.Mocked<Repository<CartItem>>;
  let shopItemRepository: jest.Mocked<Repository<ShopItem>>;
  let dataSource: any;

  const mockTransaction = (manager: any) => {
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
  };

  const activeCart = { id: 1, userId: 1, active: true, items: [] } as any;

  beforeEach(async () => {
    const mockOrdersService = {
      createOrderFromItems: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useFactory: mockRepository },
        { provide: getRepositoryToken(CartItem), useFactory: mockRepository },
        { provide: getRepositoryToken(MenuItem), useFactory: mockRepository },
        { provide: getRepositoryToken(ShopItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Order), useFactory: mockRepository },
        { provide: getRepositoryToken(OrderItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Address), useFactory: mockRepository },
        { provide: DataSource, useFactory: mockDataSource },
        { provide: OrdersService, useValue: mockOrdersService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    cartRepository = module.get(getRepositoryToken(Cart));
    cartItemRepository = module.get(getRepositoryToken(CartItem));
    shopItemRepository = module.get(getRepositoryToken(ShopItem));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should create a new active cart when none exists', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(activeCart),
    } as any;
    mockTransaction(manager);
    cartRepository.create.mockReturnValue({
      userId: 1,
      active: true,
      items: [],
    } as any);

    const result = await service.getActiveCart(1);
    expect(result).toEqual(activeCart);
  });

  it('should add an item to the cart when product is available', async () => {
    mockTransaction({
      findOne: jest.fn().mockResolvedValue(activeCart),
      save: jest.fn(),
    } as any);

    shopItemRepository.findOne.mockResolvedValue({
      id: 1,
      available: true,
      stockQuantity: 10,
      price: 5,
      name: 'Test',
      image: 'img',
    } as any);
    cartItemRepository.findOne.mockResolvedValue(null);
    cartItemRepository.create.mockReturnValue({
      cartId: 1,
      itemId: 1,
      itemType: 'shop',
      quantity: 2,
      price: 5,
    } as any);
    cartItemRepository.save.mockResolvedValue({
      id: 1,
      cartId: 1,
      itemId: 1,
      itemType: 'shop',
      quantity: 2,
      price: 5,
    } as any);

    const result = await service.addItemToCart(1, {
      itemId: 1,
      itemType: 'shop',
      quantity: 2,
    });
    expect(result).toEqual({
      id: 1,
      cartId: 1,
      itemId: 1,
      itemType: 'shop',
      quantity: 2,
      price: 5,
    });
  });

  it('should update existing cart item quantity', async () => {
    mockTransaction({
      findOne: jest.fn().mockResolvedValue(activeCart),
      save: jest.fn(),
    } as any);

    const cartItem = {
      id: 1,
      cartId: 1,
      itemType: 'shop',
      itemId: 1,
      quantity: 1,
      price: 5,
    } as any;
    cartItemRepository.findOne.mockResolvedValue(cartItem);
    shopItemRepository.findOne.mockResolvedValue({
      id: 1,
      available: true,
      stockQuantity: 10,
      price: 5,
    } as any);
    cartItemRepository.save.mockResolvedValue({ ...cartItem, quantity: 3 });

    const result = await service.updateCartItem(1, 1, { quantity: 3 });
    expect(result.quantity).toBe(3);
    expect(result.price).toBe(5);
  });

  it('should remove cart item', async () => {
    mockTransaction({
      findOne: jest.fn().mockResolvedValue(activeCart),
    } as any);

    const cartItem = { id: 1, cartId: 1 } as any;
    cartItemRepository.findOne.mockResolvedValue(cartItem);

    await service.removeCartItem(1, 1);
    expect(cartItemRepository.remove).toHaveBeenCalledWith(cartItem);
  });

  it('should clear cart items', async () => {
    mockTransaction({
      findOne: jest.fn().mockResolvedValue(activeCart),
    } as any);

    await service.clearCart(1);
    expect(cartItemRepository.delete).toHaveBeenCalledWith({ cartId: 1 });
  });

  it('should return cart details with joined item and summary', async () => {
    mockTransaction({
      findOne: jest.fn().mockResolvedValue(activeCart),
      save: jest.fn(),
    } as any);

    const joinedItem = {
      id: 1,
      cartId: 1,
      itemId: 10,
      itemType: 'menu',
      quantity: 2,
      price: 5,
      menuItem: { name: 'Burger', image: 'img' },
      shopItem: null,
    } as any;
    const queryBuilder = {
      leftJoinAndMapOne: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([joinedItem]),
    };
    cartItemRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

    const result = await service.getActiveCartDetails(1);
    const item = result.items[0] as any;
    expect(item.lineTotal).toBe(10);
    expect(item.menuItem.name).toBe('Burger');
    expect(result.summary).toEqual({
      subtotal: 10,
      tax: 0.5,
      deliveryFee: 5,
      total: 15.5,
    });
  });

  it('should throw if checkout empty cart', async () => {
    mockTransaction({
      findOne: jest.fn().mockResolvedValue(activeCart),
      find: jest.fn().mockResolvedValue([]),
    } as any);

    await expect(service.checkoutCart(1, 1)).rejects.toThrow(
      'Cannot checkout an empty cart',
    );
  });

  it('should create an order and deactivate the cart on checkout', async () => {
    const cartItems = [
      { id: 1, cartId: 1, itemId: 1, itemType: 'menu', quantity: 2 },
    ] as any;
    const address = { id: 1, userId: 1 } as any;
    const createdOrder = { id: 'ORD-1' } as any;

    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(activeCart)
        .mockResolvedValueOnce(address),
      find: jest.fn().mockResolvedValue(cartItems),
      save: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockTransaction(manager);

    const mockOrdersService = (service as any).ordersService;
    mockOrdersService.createOrderFromItems.mockResolvedValue(createdOrder);
    mockOrdersService.emitOrderUpdate = jest.fn().mockResolvedValue(undefined);

    const result = await service.checkoutCart(1, 1);

    expect(result).toEqual(createdOrder);
    expect(mockOrdersService.createOrderFromItems).toHaveBeenCalledWith(
      1,
      1,
      1,
      [
        {
          itemId: 1,
          quantity: 2,
          itemType: 'menu',
        },
      ],
      manager,
    );
    expect(manager.save).toHaveBeenCalledWith({
      ...activeCart,
      active: false,
    });
    expect(mockOrdersService.emitOrderUpdate).toHaveBeenCalledWith('ORD-1');
  });
});
