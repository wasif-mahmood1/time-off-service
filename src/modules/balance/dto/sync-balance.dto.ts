import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min
} from 'class-validator';

export class SyncBalanceDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  balance: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @IsDateString()
  updatedAt: string;
}
