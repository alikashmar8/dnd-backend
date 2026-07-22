import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateMenuCategoryDto {
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
