import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class GetShopItemsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['<10', '10-20', '>20'])
  price?: string;

  @IsOptional()
  @IsIn(['In Stock', 'Low Stock', 'Out of Stock'])
  availability?: string;

  @IsOptional()
  @IsString()
  dietary?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is_new_item?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is_popular_item?: boolean;
}
