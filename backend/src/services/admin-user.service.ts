import { UserRepository } from '../repositories/user.repository';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { UserDTO } from '../dto';

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

    // UserDTO.forAdmin gives every field (role, isActive, isPhoneVerified, etc.)
    // Admin user list needs all fields — that's the point of this page.
    return { users: users.map((u) => UserDTO.forAdmin(u)), meta };
  }
}
