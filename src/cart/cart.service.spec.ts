import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { CartService } from './cart.service';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ShopItem } from '../shop-items/entities/shop-item.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Address } from '../addresses/entities/address.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { OrdersService } from '../orders/orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateCartItemDto } from './dto/create-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const mockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
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
  let orderRepository: jest.Mocked<Repository<Order>>;
  let orderItemRepository: jest.Mocked<Repository<OrderItem>>;
  let addressRepository: jest.Mocked<Repository<Address>>;
  let restaurantRepository: jest.Mocked<Repository<Restaurant>>;
  let dataSource: any;

  beforeEach(async () => {
    const mockOrdersService = {
      createOrderFromItems: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useFactory: mockRepository },
        { provide: getRepositoryToken(CartItem), useFactory: mockRepository },
        { provide: getRepositoryToken(ShopItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Order), useFactory: mockRepository },
        { provide: getRepositoryToken(OrderItem), useFactory: mockRepository },
        { provide: getRepositoryToken(Address), useFactory: mockRepository },
        { provide: getRepositoryToken(Restaurant), useFactory: mockRepository },
        { provide: DataSource, useFactory: mockDataSource },
        { provide: OrdersService, useValue: mockOrdersService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    cartRepository = module.get(getRepositoryToken(Cart));
    cartItemRepository = module.get(getRepositoryToken(CartItem));
    shopItemRepository = module.get(getRepositoryToken(ShopItem));
    orderRepository = module.get(getRepositoryToken(Order));
    orderItemRepository = module.get(getRepositoryToken(OrderItem));
    addressRepository = module.get(getRepositoryToken(Address));
    restaurantRepository = module.get(getRepositoryToken(Restaurant));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should create a new active cart when none exists', async () => {
    cartRepository.findOne.mockResolvedValue(null);
    cartRepository.create.mockReturnValue({
      userId: 1,
      active: true,
      items: [],
    } as any);
    cartRepository.save.mockResolvedValue({
      id: 1,
      userId: 1,
      active: true,
      items: [],
    } as any);

    const result = await service.getActiveCart(1);
    expect(result).toEqual({ id: 1, userId: 1, active: true, items: [] });
  });

  it('should add an item to the cart when product is available', async () => {
    cartRepository.findOne.mockResolvedValue({
      id: 1,
      userId: 1,
      active: true,
      items: [],
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
      productId: 1,
      quantity: 2,
      price: 5,
      product: { id: 1 },
    } as any);
    cartItemRepository.save.mockResolvedValue({
      id: 1,
      cartId: 1,
      productId: 1,
      quantity: 2,
      price: 5,
    } as any);

    const result = await service.addItemToCart(1, {
      productId: 1,
      quantity: 2,
    });
    expect(result).toEqual({
      id: 1,
      cartId: 1,
      productId: 1,
      quantity: 2,
      price: 5,
    });
  });

  it('should update existing cart item quantity', async () => {
    const cart = { id: 1, userId: 1, active: true } as any;
    const cartItem = {
      id: 1,
      cartId: 1,
      quantity: 1,
      product: { available: true, stockQuantity: 10, price: 5 },
      price: 5,
    } as any;
    cartRepository.findOne.mockResolvedValue(cart);
    cartItemRepository.findOne.mockResolvedValue(cartItem);
    cartItemRepository.save.mockResolvedValue({
      ...cartItem,
      quantity: 3,
    });

    const result = await service.updateCartItem(1, 1, { quantity: 3 });
    expect(result.quantity).toBe(3);
    expect(result.price).toBe(5);
  });

  it('should remove cart item', async () => {
    const cart = { id: 1, userId: 1, active: true } as any;
    const cartItem = { id: 1, cartId: 1 } as any;
    cartRepository.findOne.mockResolvedValue(cart);
    cartItemRepository.findOne.mockResolvedValue(cartItem);

    await service.removeCartItem(1, 1);
    expect(cartItemRepository.remove).toHaveBeenCalledWith(cartItem);
  });

  it('should clear cart items', async () => {
    const cart = { id: 1, userId: 1, active: true } as any;
    cartRepository.findOne.mockResolvedValue(cart);

    await service.clearCart(1);
    expect(cartItemRepository.delete).toHaveBeenCalledWith({ cartId: 1 });
  });

  it('should throw if checkout empty cart', async () => {
    cartRepository.findOne.mockResolvedValue({
      id: 1,
      userId: 1,
      active: true,
      items: [],
    } as any);

    await expect(service.checkoutCart(1, 1)).rejects.toThrow(
      'Cannot checkout an empty cart',
    );
  });
});
