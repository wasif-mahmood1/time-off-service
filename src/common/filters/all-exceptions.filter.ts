import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';

interface HttpRequestLike {
  method: string;
  url: string;
}

interface HttpResponseLike {
  status(statusCode: number): {
    json(payload: unknown): void;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponseLike>();
    const request = ctx.getRequest<HttpRequestLike>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as { message?: unknown }).message
          : 'Internal server error';

    const error =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as { error?: string }).error
        : HttpStatus[status] ?? 'Error';

    response.status(status).json({
      statusCode: status,
      error,
      message,
      method: request.method,
      path: request.url,
      timestamp: new Date().toISOString()
    });
  }
}
