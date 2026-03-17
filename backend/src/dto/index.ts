// Central export for all DTOs.
// Import from here: import { UserDTO, AuthDTO, DashboardDTO, SessionDTO } from '../dto';

export { UserDTO } from './user.dto';
export type { UserAdminView, UserPublicView, UserAuthView } from './user.dto';

export { AuthDTO } from './auth.dto';
export type { AuthLoginResponse, AuthRefreshResponse, AuthMeResponse } from './auth.dto';

export { DashboardDTO } from './dashboard.dto';
export type { DashboardStats, DashboardResponse } from './dashboard.dto';

export { SessionDTO } from './session.dto';
export type { SessionUserView, SessionAdminView } from './session.dto';

export { CategoryDTO } from './category.dto';
export type { CategoryView } from './category.dto';

export { CollectionDTO } from './collection.dto';
export type { CollectionView } from './collection.dto';

export { ProductDTO } from './product.dto';
export type { ProductView } from './product.dto';
