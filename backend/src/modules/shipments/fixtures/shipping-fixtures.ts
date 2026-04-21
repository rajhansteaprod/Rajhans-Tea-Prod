export const mockAuthRequest = {
  email: 'test@shiprocket.com',
  password: 'testpassword123',
};

export const mockAuthToken = {
  token: 'mock-jwt-token-xyz123',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
};
