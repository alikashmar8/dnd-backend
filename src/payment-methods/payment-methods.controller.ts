import { Controller, Get, UseGuards } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AuthGuard } from '../common/guards/auth.guard';
import { PaymentMethodResponseDto } from './dto/payment-method-response.dto';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
@UseGuards(AuthGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  async findEnabled() {
    const paymentMethods = await this.paymentMethodsService.findEnabled();
    return paymentMethods.map((paymentMethod) =>
      plainToInstance(PaymentMethodResponseDto, paymentMethod),
    );
  }
}
