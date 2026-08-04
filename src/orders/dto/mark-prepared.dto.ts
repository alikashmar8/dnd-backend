import { IsEnum, IsOptional } from 'class-validator';

export class MarkPreparedDto {
  @IsOptional()
  @IsEnum(['kitchen', 'warehouse'] as const)
  role?: 'kitchen' | 'warehouse';
}
