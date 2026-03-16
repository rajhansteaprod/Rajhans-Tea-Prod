import { UserRepository } from '../repositories/user.repository';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

interface UserListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  role?: string;
  isActive?: boolean;
}

export class AdminUserService {
  private userRepo: UserRepository;

  constructor() {
    this.userRepo = new UserRepository();
  }

  async getUsers(query: UserListQuery) {
    const { page, limit, skip, sortBy, sortOrder } = parsePagination(query);

    // Build filter
    const filter: Record<string, unknown> = {};

    if (query.search) {
      const regex = { $regex: query.search, $options: 'i' };
      filter.$or = [{ phone: regex }, { firstName: regex }, { lastName: regex }, { email: regex }];
    }

    if (query.role) {
      filter.role = query.role;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const [users, total] = await Promise.all([
      this.userRepo.findMany(filter, { skip, limit, sortBy, sortOrder }),
      this.userRepo.count(filter),
    ]);

    const meta = buildPaginationMeta(page, limit, total);

    // Strip heavy fields for list view
    const sanitized = users.map((u) => ({
      _id: u._id.toString(),
      phone: u.phone,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      isPhoneVerified: u.isPhoneVerified,
      lastLogin: u.lastLogin,
      createdAt: u.createdAt,
    }));

    return { users: sanitized, meta };
  }
}
