export interface IAddress {
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface IUser {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'customer' | 'admin';
  isPhoneVerified: boolean;
  addresses: IAddress[];
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPublic {
  _id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: string;
  avatar?: string;
}
