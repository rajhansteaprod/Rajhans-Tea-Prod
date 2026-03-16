export interface ISendOtpRequest {
  phone: string;
}

export interface ISendOtpResponse {
  message: string;
  expiresIn: number;
}

export interface IVerifyOtpRequest {
  phone: string;
  otp: string;
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthResponse {
  user: {
    _id: string;
    phone: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
  tokens: IAuthTokens;
  isNewUser: boolean;
}

export interface IRefreshTokenRequest {
  refreshToken: string;
}

export interface IRefreshTokenResponse {
  tokens: IAuthTokens;
}

export interface ITokenPayload {
  userId: string;
  role: string;
}
