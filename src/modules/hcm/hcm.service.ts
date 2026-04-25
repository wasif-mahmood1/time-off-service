import { Inject, Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  HcmDeductionException,
  HcmValidationException
} from 'src/common/errors/domain-errors';
import { sleep } from 'src/common/utils/sleep';
import { AppConfig } from 'src/config/app-config.interface';
import { APP_CONFIG } from 'src/config/config.constants';
import {
  HcmDeductionResult,
  HcmRequestDto,
  HcmValidationResult
} from './dto/hcm-request.dto';

interface HcmResponse<T> {
  status: number;
  data: T;
}

interface HcmValidationApiResponse {
  valid?: boolean;
  reason?: string;
}

interface HcmDeductionApiResponse {
  success?: boolean;
  externalRefId?: string;
  reason?: string;
}

@Injectable()
export class HcmService {
  private readonly client: AxiosInstance;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = axios.create({
      baseURL: this.config.hcm.baseUrl.replace(/\/$/, ''),
      timeout: this.config.hcm.timeoutMs,
      validateStatus: () => true
    });
  }

  async validateRequest(dto: HcmRequestDto): Promise<HcmValidationResult> {
    const response = await this.postWithRetry<HcmValidationApiResponse>(
      '/hcm/validate',
      dto,
      'validate'
    );

    if (response.status === 409) {
      return {
        valid: false,
        reason: response.data.reason ?? 'HCM rejected validation'
      };
    }

    if (response.status < 200 || response.status >= 300) {
      throw new HcmValidationException(
        response.data.reason ?? `HCM validation returned ${response.status}`
      );
    }

    return {
      valid: response.data.valid === true,
      reason: response.data.reason
    };
  }

  async deductBalance(dto: HcmRequestDto): Promise<HcmDeductionResult> {
    const response = await this.postWithRetry<HcmDeductionApiResponse>(
      '/hcm/deduct',
      dto,
      'deduct'
    );

    if (response.status < 200 || response.status >= 300) {
      throw new HcmDeductionException(
        response.data.reason ?? `HCM deduction returned ${response.status}`
      );
    }

    if (!response.data.success || !response.data.externalRefId) {
      throw new HcmDeductionException('HCM deduction response was incomplete');
    }

    return {
      success: true,
      externalRefId: response.data.externalRefId
    };
  }

  private async postWithRetry<T>(
    path: string,
    payload: HcmRequestDto,
    operation: string
  ): Promise<HcmResponse<T>> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.hcm.retryAttempts; attempt += 1) {
      try {
        const response = await this.client.post<T>(path, payload);
        if (!this.shouldRetryStatus(response.status)) {
          return {
            status: response.status,
            data: response.data
          };
        }

        lastError = new Error(`HCM ${operation} returned ${response.status}`);
      } catch (error) {
        lastError = error;
        if (!this.isRetryableError(error)) {
          break;
        }
      }

      if (attempt < this.config.hcm.retryAttempts) {
        await sleep(this.config.hcm.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }

    const message = this.errorMessage(lastError, operation);
    if (operation === 'validate') {
      throw new HcmValidationException(message);
    }

    throw new HcmDeductionException(message);
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const axiosError = error as AxiosError;
    return !axiosError.response || this.shouldRetryStatus(axiosError.response.status);
  }

  private errorMessage(error: unknown, operation: string): string {
    if (error instanceof Error) {
      return `HCM ${operation} failed after retries: ${error.message}`;
    }

    return `HCM ${operation} failed after retries`;
  }
}
