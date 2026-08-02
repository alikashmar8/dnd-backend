import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateMenuCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @ValidateIf(
    (o: CreateMenuCategoryDto) =>
      o.parentId !== undefined && o.parentId !== null,
  )
  @IsInt()
  @Min(1)
  parentId?: number | null;
}
