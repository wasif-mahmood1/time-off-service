import { BalanceSyncItemResult } from '../../balance/balance.service';

export class BatchSyncResponseDto {
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  results: BalanceSyncItemResult[];
}
