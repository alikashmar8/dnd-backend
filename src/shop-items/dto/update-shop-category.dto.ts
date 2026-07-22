import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateShopCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  image?: string;
}
