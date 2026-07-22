import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
