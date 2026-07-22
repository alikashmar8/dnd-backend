import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class GetShopItemsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  category?: string;

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
}
