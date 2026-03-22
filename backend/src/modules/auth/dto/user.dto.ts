import { IUserDoc } from '../models/user.model';

// ---------------------------------------------------------------------------
// View types
// What each role sees when they ask about a user.
// ---------------------------------------------------------------------------

/**
 * AdminView — every field, including sensitive ops fields.
 * Returned to admin callers on list/detail/dashboard endpoints.
 */
export interface UserAdminView {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'customer' | 'admin';
  isActive: boolean;
  isPhoneVerified: boolean;
  avatar?: string;
  lastLogin?: Date;
  isBanned: boolean;
  bannedAt?: Date;
  bannedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * UserView — public-safe fields only.
 * Returned to regular (customer) callers on /me and profile endpoints.
 * No isActive, no isPhoneVerified, no lastLogin — customer doesn't need these.
 */
export interface UserPublicView {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'customer' | 'admin';
  avatar?: string;
}

/**
 * AuthView — minimal embed for login/refresh responses.
 * Kept small intentionally — the frontend only needs this to bootstrap state.
 * Full profile is fetched separately on /me.
 */
export interface UserAuthView {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  role: 'customer' | 'admin';
}

// ---------------------------------------------------------------------------
// Factory class
// Static methods — call them like: UserDTO.forAdmin(userDoc)
// ---------------------------------------------------------------------------

export class UserDTO {
  /**
   * Full admin view — use for admin panel lists, dashboard, any admin endpoint.
   * Returns ALL fields including sensitive ones (isActive, isPhoneVerified, etc.)
   */
  static forAdmin(user: IUserDoc): UserAdminView {
    return {
      _id: user._id.toString(),
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isPhoneVerified: user.isPhoneVerified,
      avatar: user.avatar,
      lastLogin: user.lastLogin,
      isBanned: user.isBanned ?? false,
      bannedAt: user.bannedAt,
      bannedReason: user.bannedReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Public user view — use when a customer is viewing their own profile (/me).
   * Strips operational fields that are internal/sensitive.
   */
  static forUser(user: IUserDoc): UserPublicView {
    return {
      _id: user._id.toString(),
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    };
  }

  /**
   * Auth embed — use when embedding user info inside a login/refresh response.
   * Minimal by design: just enough for the frontend to know who logged in.
   */
  static forAuth(user: IUserDoc): UserAuthView {
    return {
      _id: user._id.toString(),
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  /**
   * Role-aware factory — picks the right view based on the caller's role.
   *
   * Example usage (in /me endpoint):
   *   UserDTO.fromRole(user, req.user.role)
   *
   * - Admin calling /me  → gets UserAdminView (all fields)
   * - Customer calling /me → gets UserPublicView (safe fields only)
   */
  static fromRole(user: IUserDoc, role: 'admin' | 'customer'): UserAdminView | UserPublicView {
    return role === 'admin' ? UserDTO.forAdmin(user) : UserDTO.forUser(user);
  }
}
