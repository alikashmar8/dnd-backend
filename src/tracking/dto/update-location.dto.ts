import { IsNumber, Max, Min } from 'class-validator';

/**
 * Validated driver-location update shared by the Socket.io gateway and the REST
 * fallback (`PATCH /driver/location`). `@IsNumber()` already rejects strings,
 * NaN and ±Infinity; `@Min`/`@Max` enforce the physical coordinate range so a
 * malformed payload can never be stored or broadcast.
 */
export class UpdateLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
