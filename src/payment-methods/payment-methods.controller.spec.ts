import { GUARDS_METADATA } from '@nestjs/common/constants';
import { instanceToPlain } from 'class-transformer';
import { AuthGuard } from '../common/guards/auth.guard';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsController', () => {
  const paymentMethodsService = {
    findEnabled: jest.fn(),
  } as unknown as PaymentMethodsService;
  const controller = new PaymentMethodsController(paymentMethodsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PaymentMethodsController)).toContain(
      AuthGuard,
    );
  });

  it('returns the public payment-method contract only', async () => {
    jest.spyOn(paymentMethodsService, 'findEnabled').mockResolvedValue([
      {
        id: 1,
        guid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Cash on Delivery',
        nameAr: 'الدفع عند الاستلام',
        fixedFees: '2.50',
        percentageFees: '1.25',
        isEnabled: true,
        createdOn: new Date(),
      },
    ] as never);

    const response = await controller.findEnabled();

    expect(instanceToPlain(response)).toEqual([
      {
        guid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Cash on Delivery',
        nameAr: 'الدفع عند الاستلام',
        fixedFees: 2.5,
        percentageFees: 1.25,
        isEnabled: true,
      },
    ]);
  });
});
