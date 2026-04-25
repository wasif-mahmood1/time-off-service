import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { RequestTimeOffDto } from './dto/request-time-off.dto';
import { TimeOffResponseDto } from './dto/time-off-response.dto';
import { TimeOffService } from './timeoff.service';

@Controller('time-off')
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post('request')
  requestTimeOff(
    @Body() dto: RequestTimeOffDto,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<TimeOffResponseDto> {
    return this.timeOffService.requestTimeOff(dto, idempotencyKey);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveRequest(@Param('id') id: string): Promise<TimeOffResponseDto> {
    return this.timeOffService.approveRequest(id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectRequest(@Param('id') id: string): Promise<TimeOffResponseDto> {
    return this.timeOffService.rejectRequest(id);
  }
}
