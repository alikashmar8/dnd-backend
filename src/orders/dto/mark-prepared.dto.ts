import { IsEnum, IsNotEmpty } from 'class-validator';

export class MarkPreparedDto {
  @IsEnum(['kitchen', 'warehouse'] as const)
  @IsNotEmpty()
  role!: 'kitchen' | 'warehouse';
}
