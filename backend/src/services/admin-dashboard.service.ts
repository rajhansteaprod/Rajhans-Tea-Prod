import { UserRepository } from '../repositories/user.repository';
import { DashboardDTO } from '../dto';

export class AdminDashboardService {
  private userRepo: UserRepository;

  constructor() {
    this.userRepo = new UserRepository();
  }

  async getStats() {
    const [totalUsers, activeUsers, adminUsers, recentUsers] = await Promise.all([
      this.userRepo.count({}),
      this.userRepo.count({ isActive: true } as never),
      this.userRepo.count({ role: 'admin' } as never),
      this.userRepo.findMany({} as never, { limit: 5, sortBy: 'createdAt', sortOrder: -1 }),
    ]);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [todaySignups, weekSignups] = await Promise.all([
      this.userRepo.count({ createdAt: { $gte: todayStart } } as never),
      this.userRepo.count({ createdAt: { $gte: weekStart } } as never),
    ]);

    // DashboardDTO.fromData shapes the response:
    // - stats object with all 6 counters
    // - recentUsers mapped through UserDTO.forAdmin (full admin view per user)
    return DashboardDTO.fromData(
      {
        totalUsers,
        activeUsers,
        adminUsers,
        customerUsers: totalUsers - adminUsers,
        todaySignups,
        weekSignups,
      },
      recentUsers,
    );
  }
}
