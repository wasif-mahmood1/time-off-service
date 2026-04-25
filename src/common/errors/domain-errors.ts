import {
  BadGatewayException,
  ConflictException,
  NotFoundException
} from '@nestjs/common';

export class BalanceNotFoundException extends NotFoundException {
  constructor(employeeId: string, locationId: string) {
    super(`No cached balance found for employee ${employeeId} at location ${locationId}`);
  }
}

export class InsufficientBalanceException extends ConflictException {
  constructor(available: number, requested: number) {
    super(`Insufficient balance: requested ${requested}, available ${available}`);
  }
}

export class OptimisticBalanceUpdateException extends ConflictException {
  constructor() {
    super('Balance was modified concurrently. Retry the operation.');
  }
}

export class IdempotencyConflictException extends ConflictException {
  constructor() {
    super('Idempotency-Key was already used with a different request payload');
  }
}

export class HcmValidationException extends BadGatewayException {
  constructor(message = 'HCM validation failed') {
    super(message);
  }
}

export class HcmDeductionException extends BadGatewayException {
  constructor(message = 'HCM balance deduction failed') {
    super(message);
  }
}
