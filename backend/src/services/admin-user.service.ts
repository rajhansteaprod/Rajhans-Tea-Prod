import { UserRepository } from '../repositories/user.repository';
import { TokenRepository } from '../repositories/token.repository';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { UserDTO } from '../dto';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/api-error';

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
  private tokenRepo: TokenRepository;

  constructor() {
    this.userRepo = new UserRepository();
    this.tokenRepo = new TokenRepository();
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

  async createUser(data: {
    phone: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: 'customer' | 'admin';
  }) {
    const existing = await this.userRepo.findByPhone(data.phone);
    if (existing) throw new ConflictError('A user with this phone number already exists');

    const user = await this.userRepo.create({
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role ?? 'customer',
      isPhoneVerified: false,
      isActive: true,
      isBanned: false,
    });
    return UserDTO.forAdmin(user);
  }

  async updateUser(
    userId: string,
    _callerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: string;
      isActive?: boolean;
    },
  ) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    // Prevent demoting the only admin to customer
    if (data.role === 'customer' && user.role === 'admin') {
      const adminCount = await this.userRepo.count({ role: 'admin' });
      if (adminCount <= 1) throw new BadRequestError('Cannot demote the only admin account');
    }

    const updated = await this.userRepo.updateById(userId, {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    });
    if (!updated) throw new NotFoundError('User not found');
    return UserDTO.forAdmin(updated);
  }

  async deleteUser(userId: string, callerId: string) {
    if (userId === callerId) throw new BadRequestError('You cannot delete your own account');
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    // Revoke all sessions first
    await this.tokenRepo.deleteByUserId(userId);
    await this.userRepo.deleteById(userId);
  }

  async banUser(userId: string, callerId: string, reason?: string) {
    if (userId === callerId) throw new BadRequestError('You cannot ban your own account');
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (user.isBanned) throw new ConflictError('User is already banned');

    const updated = await this.userRepo.banUser(userId, reason);
    // Revoke all sessions so ban takes effect immediately
    await this.tokenRepo.deleteByUserId(userId);
    return UserDTO.forAdmin(updated!);
  }

  async unbanUser(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    if (!user.isBanned) throw new ConflictError('User is not banned');

    const updated = await this.userRepo.unbanUser(userId);
    return UserDTO.forAdmin(updated!);
  }
}
