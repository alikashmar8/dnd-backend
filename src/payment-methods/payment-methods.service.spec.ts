import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethod>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        {
          provide: getRepositoryToken(PaymentMethod),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PaymentMethodsService);
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethod));
  });

  it('returns only enabled payment methods in stable ID order', async () => {
    const methods = [{ id: 2, isEnabled: true }] as PaymentMethod[];
    paymentMethodRepository.find.mockResolvedValue(methods);

    await expect(service.findEnabled()).resolves.toEqual(methods);
    expect(paymentMethodRepository.find).toHaveBeenCalledWith({
      where: { isEnabled: true },
      order: { id: 'ASC' },
    });
  });

  it('returns an empty array when no enabled payment methods exist', async () => {
    paymentMethodRepository.find.mockResolvedValue([]);

    await expect(service.findEnabled()).resolves.toEqual([]);
  });
});
