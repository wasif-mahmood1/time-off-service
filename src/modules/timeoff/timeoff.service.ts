import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  HcmValidationException,
  IdempotencyConflictException,
  InsufficientBalanceException
} from 'src/common/errors/domain-errors';
import { BalanceService } from '../balance/balance.service';
import { HcmService } from '../hcm/hcm.service';
import { RequestTimeOffDto } from './dto/request-time-off.dto';
import { TimeOffResponseDto } from './dto/time-off-response.dto';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { TimeOffRequestStatus } from './entities/time-off-request-status.enum';

@Injectable()
export class TimeOffService {
  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly hcmService: HcmService
  ) {}

  async requestTimeOff(
    dto: RequestTimeOffDto,
    idempotencyKey?: string
  ): Promise<TimeOffResponseDto> {
    const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);
    const existing = await this.findByIdempotencyKey(normalizedKey);

    if (existing) {
      this.assertIdempotentPayloadMatches(existing, dto);
      return this.toResponse(existing);
    }

    const balance = await this.balanceService.getBalanceOrThrow(
      dto.employeeId,
      dto.locationId
    );

    if (balance.balance < dto.daysRequested) {
      const rejected = await this.createRequest(
        dto,
        TimeOffRequestStatus.REJECTED,
        normalizedKey
      );
      return this.toResponse(rejected);
    }

    const validation = await this.hcmService.validateRequest(dto);
    if (!validation.valid) {
      throw new HcmValidationException(validation.reason);
    }

    const pending = await this.createRequest(
      dto,
      TimeOffRequestStatus.PENDING,
      normalizedKey
    );
    return this.toResponse(pending);
  }

  async approveRequest(id: string): Promise<TimeOffResponseDto> {
    const request = await this.getRequestOrThrow(id);

    if (request.status === TimeOffRequestStatus.APPROVED) {
      return this.toResponse(request);
    }

    if (request.status === TimeOffRequestStatus.REJECTED) {
      throw new ConflictException('Rejected requests cannot be approved');
    }

    try {
      const deduction = await this.hcmService.deductBalance({
        employeeId: request.employeeId,
        locationId: request.locationId,
        daysRequested: request.daysRequested
      });

      await this.balanceService.decrementBalanceWithRetry(
        request.employeeId,
        request.locationId,
        request.daysRequested
      );

      request.status = TimeOffRequestStatus.APPROVED;
      request.externalRefId = deduction.externalRefId;
      const approved = await this.requestRepository.save(request);
      return this.toResponse(approved);
    } catch (error) {
      if (error instanceof InsufficientBalanceException) {
        request.status = TimeOffRequestStatus.FAILED;
        const failed = await this.requestRepository.save(request);
        return this.toResponse(failed);
      }

      request.status = TimeOffRequestStatus.FAILED;
      const failed = await this.requestRepository.save(request);

      if (error instanceof ConflictException) {
        throw error;
      }

      return this.toResponse(failed);
    }
  }

  async rejectRequest(id: string): Promise<TimeOffResponseDto> {
    const request = await this.getRequestOrThrow(id);

    if (request.status === TimeOffRequestStatus.APPROVED) {
      throw new ConflictException('Approved requests cannot be rejected');
    }

    request.status = TimeOffRequestStatus.REJECTED;
    const rejected = await this.requestRepository.save(request);
    return this.toResponse(rejected);
  }

  async getRequestOrThrow(id: string): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found`);
    }

    return request;
  }

  toResponse(request: TimeOffRequest): TimeOffResponseDto {
    return {
      id: request.id,
      employeeId: request.employeeId,
      locationId: request.locationId,
      daysRequested: request.daysRequested,
      status: request.status,
      externalRefId: request.externalRefId,
      idempotencyKey: request.idempotencyKey,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString()
    };
  }

  private async createRequest(
    dto: RequestTimeOffDto,
    status: TimeOffRequestStatus,
    idempotencyKey: string
  ): Promise<TimeOffRequest> {
    const request = this.requestRepository.create({
      ...dto,
      status,
      externalRefId: null,
      idempotencyKey
    });

    try {
      return await this.requestRepository.save(request);
    } catch (error) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        this.assertIdempotentPayloadMatches(existing, dto);
        return existing;
      }

      throw error;
    }
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string {
    const normalized = idempotencyKey?.trim();
    if (!normalized) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (normalized.length > 256) {
      throw new BadRequestException('Idempotency-Key must be 256 characters or fewer');
    }

    return normalized;
  }

  private async findByIdempotencyKey(
    idempotencyKey: string
  ): Promise<TimeOffRequest | null> {
    return this.requestRepository.findOne({ where: { idempotencyKey } });
  }

  private assertIdempotentPayloadMatches(
    request: TimeOffRequest,
    dto: RequestTimeOffDto
  ): void {
    const sameEmployee = request.employeeId === dto.employeeId;
    const sameLocation = request.locationId === dto.locationId;
    const sameDays = Math.abs(request.daysRequested - dto.daysRequested) < 0.0001;

    if (!sameEmployee || !sameLocation || !sameDays) {
      throw new IdempotencyConflictException();
    }
  }
}
