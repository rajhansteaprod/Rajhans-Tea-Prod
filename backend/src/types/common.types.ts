export interface IApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: IPaginationMeta;
}

export interface IApiError {
  success: false;
  statusCode: number;
  message: string;
  errors?: IFieldError[];
  stack?: string;
}

export interface IFieldError {
  field: string;
  message: string;
}

export interface IPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface IPaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
