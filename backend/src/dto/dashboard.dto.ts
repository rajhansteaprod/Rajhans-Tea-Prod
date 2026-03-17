import { IUserDoc } from '../models/user.model';
import { UserAdminView, UserDTO } from './user.dto';

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * The six stat counters shown on the admin dashboard.
 */
export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  customerUsers: number;
  todaySignups: number;
  weekSignups: number;
}

/**
 * Full dashboard response.
 * Stats + the 5 most recently joined users (admin view).
 *
 * Why UserAdminView for recentUsers?
 * The dashboard is an admin-only page. Admins need to see role, isActive,
 * and join date at a glance to identify suspicious or incomplete accounts.
 */
export interface DashboardResponse {
  stats: DashboardStats;
  recentUsers: UserAdminView[];
}

// ---------------------------------------------------------------------------
// Factory class
// ---------------------------------------------------------------------------

export class DashboardDTO {
  /**
   * Assembles the full dashboard response from raw DB data.
   *
   * @param stats     - The pre-computed aggregation numbers.
   * @param recentUsers - Raw Mongoose documents for the last 5 signups.
   *
   * Each recent user is mapped through UserDTO.forAdmin so the shape is
   * consistent with the admin user list — same fields, same types.
   */
  static fromData(stats: DashboardStats, recentUsers: IUserDoc[]): DashboardResponse {
    return {
      stats,
      recentUsers: recentUsers.map((u) => UserDTO.forAdmin(u)),
    };
  }
}
