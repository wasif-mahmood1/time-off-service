import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class HcmRequestDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  daysRequested: number;
}

export interface HcmValidationResult {
  valid: boolean;
  reason?: string;
}

export interface HcmDeductionResult {
  success: boolean;
  externalRefId: string;
}
