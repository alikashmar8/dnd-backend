import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
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

  /** Legacy bucket filter (kept for compatibility with existing clients). */
  @IsOptional()
  @IsIn(['<10', '10-20', '>20'])
  price?: string;

  /** Numeric price range filters (combined with any `price` bucket if both sent). */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  /** Numeric minimum rating filter, e.g. minRating=4 means rating >= 4. */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsIn(['In Stock', 'Low Stock', 'Out of Stock'])
  availability?: string;

  @IsOptional()
  @IsString()
  dietary?: string;

  @IsOptional()
  @IsIn(['newest', 'popular'])
  sort?: 'newest' | 'popular';

  @IsOptional()
  is_new_item ?: boolean;

  @IsOptional()
  is_popular_item ?: boolean;
}
