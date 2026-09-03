import { instanceToPlain, plainToInstance } from 'class-transformer';
import { PaymentMethodResponseDto } from './payment-method-response.dto';

describe('PaymentMethodResponseDto', () => {
  it('exposes only the public fields and converts decimal fees to numbers', () => {
    const response = instanceToPlain(
      plainToInstance(PaymentMethodResponseDto, {
        id: 1,
        guid: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Cash on Delivery',
        nameAr: 'الدفع عند الاستلام',
        fixedFees: '2.50',
        percentageFees: '1.25',
        isEnabled: true,
        createdOn: new Date(),
      }),
    );

    expect(response).toEqual({
      guid: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Cash on Delivery',
      nameAr: 'الدفع عند الاستلام',
      fixedFees: 2.5,
      percentageFees: 1.25,
      isEnabled: true,
    });
    expect(response).not.toHaveProperty('id');
    expect(response).not.toHaveProperty('createdOn');
  });
});
