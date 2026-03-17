// Central export for all DTOs.
// Import from here: import { UserDTO, AuthDTO, DashboardDTO } from '../dto';

export { UserDTO } from './user.dto';
export type { UserAdminView, UserPublicView, UserAuthView } from './user.dto';

export { AuthDTO } from './auth.dto';
export type { AuthLoginResponse, AuthRefreshResponse, AuthMeResponse } from './auth.dto';

export { DashboardDTO } from './dashboard.dto';
export type { DashboardStats, DashboardResponse } from './dashboard.dto';
