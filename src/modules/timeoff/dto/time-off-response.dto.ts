import { TimeOffRequestStatus } from '../entities/time-off-request-status.enum';

export class TimeOffResponseDto {
  id: string;
  employeeId: string;
  locationId: string;
  daysRequested: number;
  status: TimeOffRequestStatus;
  externalRefId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}
