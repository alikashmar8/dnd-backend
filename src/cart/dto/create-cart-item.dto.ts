import { IsEnum, IsInt, IsNotEmpty, Min } from 'class-validator';

export class CreateCartItemDto {
  @IsInt()
  @Min(1)
  itemId!: number;

  @IsEnum(['menu', 'shop'])
  itemType!: 'menu' | 'shop';

  @IsInt()
  @Min(1)
  quantity!: number;
}
