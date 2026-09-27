export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiError<T> = {
  success: false;
  message: string;
  errorCode?: string;
  errorData?: T;
};
