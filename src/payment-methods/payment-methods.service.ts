import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  async findEnabled(): Promise<PaymentMethod[]> {
    return this.paymentMethodRepository.find({
      where: { isEnabled: true },
      order: { id: 'ASC' },
    });
  }
}
