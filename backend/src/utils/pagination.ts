import { IPaginationMeta, IPaginationQuery } from '../types/common.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(query: IPaginationQuery) {
  const page = Math.max(1, query.page || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = (query.sortOrder === 'asc' ? 1 : -1) as 1 | -1;

  return { page, limit, skip, sortBy, sortOrder };
}

export function buildPaginationMeta(page: number, limit: number, total: number): IPaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
