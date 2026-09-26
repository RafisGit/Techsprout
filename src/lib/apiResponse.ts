import { ApiError, ApiSuccess } from '@/types/api';
import { NextResponse } from 'next/server';

function successResponse<T>(message: string, data: T, status: number = 200) {
  const body: ApiSuccess<T> = {
    success: true,
    message,
    data,
  };

  return NextResponse.json(body, { status });
}

function errorResponse<T>(
  message: string,
  status: number = 400,
  errorCode?: string,
  errorData?: T
) {
  const body: ApiError<T> = {
    success: false,
    message,
    errorData,
    ...(errorCode && { errorCode }),
  };

  return NextResponse.json(body, { status });
}

export { successResponse, errorResponse };
