import { IUserDoc } from '../models/user.model';
import { IAuthTokens } from '../types/auth.types';
import { UserAuthView, UserDTO } from './user.dto';

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * Returned by POST /auth/verify-token (login).
 * Contains the authenticated user, both tokens, and whether it's a brand new account.
 */
export interface AuthLoginResponse {
  user: UserAuthView;
  tokens: IAuthTokens;
  isNewUser: boolean;
}

/**
 * Returned by POST /auth/refresh-token.
 * Only tokens — no user data needed since the frontend already has it.
 */
export interface AuthRefreshResponse {
  tokens: IAuthTokens;
}

/**
 * Returned by GET /auth/me.
 * Full profile shaped by role — admin sees more than customer.
 * Uses UserDTO.fromRole internally.
 */
export interface AuthMeResponse {
  user: ReturnType<typeof UserDTO.fromRole>;
}

// ---------------------------------------------------------------------------
// Factory class
// ---------------------------------------------------------------------------

export class AuthDTO {
  /**
   * Builds the login response.
   *
   * What it does:
   * 1. Embeds a minimal user view (UserDTO.forAuth) — just enough for the
   *    frontend to bootstrap: name, role, _id.
   * 2. Attaches both tokens.
   * 3. Tells the frontend whether this was a first-ever login (isNewUser).
   *
   * Why UserDTO.forAuth and not forAdmin/forUser?
   * Because at login time we want the same minimal response for ALL roles.
   * Admins don't need to see isActive/isPhoneVerified in their login response.
   */
  static fromLogin(user: IUserDoc, tokens: IAuthTokens, isNewUser: boolean): AuthLoginResponse {
    return {
      user: UserDTO.forAuth(user),
      tokens,
      isNewUser,
    };
  }

  /**
   * Builds the refresh-token response.
   * Just wraps the new token pair — no user data.
   */
  static fromRefresh(tokens: IAuthTokens): AuthRefreshResponse {
    return { tokens };
  }

  /**
   * Builds the /me profile response.
   * Role-aware: admin gets all fields, customer gets public fields only.
   */
  static fromProfile(user: IUserDoc, role: 'admin' | 'customer'): AuthMeResponse {
    return {
      user: UserDTO.fromRole(user, role),
    };
  }
}
