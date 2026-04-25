import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BalanceNotFoundException,
  InsufficientBalanceException,
  OptimisticBalanceUpdateException
} from 'src/common/errors/domain-errors';
import { sleep } from 'src/common/utils/sleep';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { SyncBalanceDto } from './dto/sync-balance.dto';
import { Balance } from './entities/balance.entity';

export interface BalanceSyncItemResult {
  employeeId: string;
  locationId: string;
  action: 'inserted' | 'updated' | 'skipped';
  reason?: string;
}

export interface BalanceSyncResult {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  results: BalanceSyncItemResult[];
}

const MAX_OPTIMISTIC_RETRIES = 5;
const OPTIMISTIC_RETRY_BASE_DELAY_MS = 25;

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
    private readonly dataSource: DataSource
  ) {}

  async getCachedBalance(
    employeeId: string,
    locationId: string
  ): Promise<BalanceResponseDto> {
    const balance = await this.getBalanceOrThrow(employeeId, locationId);
    return this.toResponse(balance);
  }

  async getBalanceOrThrow(employeeId: string, locationId: string): Promise<Balance> {
    const balance = await this.balanceRepository.findOne({
      where: { employeeId, locationId }
    });

    if (!balance) {
      throw new BalanceNotFoundException(employeeId, locationId);
    }

    return balance;
  }

  async validateSufficientBalance(
    employeeId: string,
    locationId: string,
    daysRequested: number
  ): Promise<Balance> {
    const balance = await this.getBalanceOrThrow(employeeId, locationId);

    if (balance.balance < daysRequested) {
      throw new InsufficientBalanceException(balance.balance, daysRequested);
    }

    return balance;
  }

  async decrementBalanceWithRetry(
    employeeId: string,
    locationId: string,
    daysRequested: number,
    manager: EntityManager = this.dataSource.manager
  ): Promise<Balance> {
    for (let attempt = 1; attempt <= MAX_OPTIMISTIC_RETRIES; attempt += 1) {
      const current = await manager.findOne(Balance, {
        where: { employeeId, locationId }
      });

      if (!current) {
        throw new BalanceNotFoundException(employeeId, locationId);
      }

      if (current.balance < daysRequested) {
        throw new InsufficientBalanceException(current.balance, daysRequested);
      }

      const now = new Date();
      const updateResult = await manager
        .createQueryBuilder()
        .update(Balance)
        .set({
          balance: () => 'ROUND(balance - :daysRequested, 4)',
          version: () => 'version + 1',
          updatedAt: now
        })
        .where('id = :id', { id: current.id })
        .andWhere('version = :version', { version: current.version })
        .andWhere('balance >= :daysRequested', { daysRequested })
        .execute();

      if (updateResult.affected === 1) {
        const updated = await manager.findOneByOrFail(Balance, { id: current.id });
        return updated;
      }

      await sleep(OPTIMISTIC_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    throw new OptimisticBalanceUpdateException();
  }

  async syncBalances(balances: SyncBalanceDto[]): Promise<BalanceSyncResult> {
    return this.dataSource.transaction(async (manager) => {
      const results: BalanceSyncItemResult[] = [];

      for (const dto of balances) {
        const incomingUpdatedAt = new Date(dto.updatedAt);
        const existing = await manager.findOne(Balance, {
          where: {
            employeeId: dto.employeeId,
            locationId: dto.locationId
          }
        });

        if (!existing) {
          await manager
            .createQueryBuilder()
            .insert()
            .into(Balance)
            .values({
              employeeId: dto.employeeId,
              locationId: dto.locationId,
              balance: dto.balance,
              version: dto.version,
              updatedAt: incomingUpdatedAt
            })
            .execute();

          results.push({
            employeeId: dto.employeeId,
            locationId: dto.locationId,
            action: 'inserted'
          });
          continue;
        }

        if (!this.shouldApplyIncomingBalance(existing, dto, incomingUpdatedAt)) {
          results.push({
            employeeId: dto.employeeId,
            locationId: dto.locationId,
            action: 'skipped',
            reason: 'incoming balance is stale'
          });
          continue;
        }

        const updateResult = await manager
          .createQueryBuilder()
          .update(Balance)
          .set({
            balance: dto.balance,
            version: dto.version,
            updatedAt: incomingUpdatedAt
          })
          .where('id = :id', { id: existing.id })
          .andWhere(
            '(version < :version OR (version = :version AND updatedAt < :updatedAt))',
            {
              version: dto.version,
              updatedAt: incomingUpdatedAt
            }
          )
          .execute();

        results.push({
          employeeId: dto.employeeId,
          locationId: dto.locationId,
          action: updateResult.affected === 1 ? 'updated' : 'skipped',
          reason: updateResult.affected === 1 ? undefined : 'balance changed during sync'
        });
      }

      return {
        received: balances.length,
        inserted: results.filter((item) => item.action === 'inserted').length,
        updated: results.filter((item) => item.action === 'updated').length,
        skipped: results.filter((item) => item.action === 'skipped').length,
        results
      };
    });
  }

  toResponse(balance: Balance): BalanceResponseDto {
    return {
      id: balance.id,
      employeeId: balance.employeeId,
      locationId: balance.locationId,
      balance: balance.balance,
      version: balance.version,
      updatedAt: balance.updatedAt.toISOString()
    };
  }

  private shouldApplyIncomingBalance(
    existing: Balance,
    dto: SyncBalanceDto,
    incomingUpdatedAt: Date
  ): boolean {
    if (dto.version > existing.version) {
      return true;
    }

    return (
      dto.version === existing.version &&
      incomingUpdatedAt.getTime() > existing.updatedAt.getTime()
    );
  }
}
