import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const driverError = exception.driverError as unknown as Record<
      string,
      unknown
    >;
    const code = driverError?.code as string | undefined;

    let statusCode: number;
    let message: string;
    let error: string;

    switch (code) {
      case '23505':
        statusCode = HttpStatus.CONFLICT;
        message =
          (driverError?.detail as string) || 'A unique constraint was violated';
        error = 'Conflict';
        break;

      case '23503':
        statusCode = HttpStatus.BAD_REQUEST;
        message =
          (driverError?.detail as string) ||
          'A foreign key constraint was violated';
        error = 'Bad Request';
        break;

      case '23502':
        statusCode = HttpStatus.BAD_REQUEST;
        message =
          (driverError?.detail as string) ||
          'A not-null constraint was violated';
        error = 'Bad Request';
        break;

      default:
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'An unexpected database error occurred';
        error = 'Internal Server Error';
        break;
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
    });
  }
}
