import { AuthService } from '../../../src/services/auth.service';
import { UserRepository } from '../../../src/repositories/user.repository';
import { OtpRepository } from '../../../src/repositories/otp.repository';
import { TokenRepository } from '../../../src/repositories/token.repository';
import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../../../src/utils/api-error';

// Mock repositories
jest.mock('../../../src/repositories/user.repository');
jest.mock('../../../src/repositories/otp.repository');
jest.mock('../../../src/repositories/token.repository');

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockOtpRepo: jest.Mocked<OtpRepository>;
  let mockTokenRepo: jest.Mocked<TokenRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();

    mockUserRepo = (authService as unknown as { userRepo: jest.Mocked<UserRepository> }).userRepo;
    mockOtpRepo = (authService as unknown as { otpRepo: jest.Mocked<OtpRepository> }).otpRepo;
    mockTokenRepo = (authService as unknown as { tokenRepo: jest.Mocked<TokenRepository> }).tokenRepo;
  });

  const expectApiError = async (promise: Promise<unknown>, statusCode: number) => {
    try {
      await promise;
      fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(statusCode);
    }
  };

  describe('sendOtp', () => {
    it('should send OTP for a valid phone number', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue(null);
      mockOtpRepo.deleteByPhone.mockResolvedValue(undefined);
      mockOtpRepo.create.mockResolvedValue({} as never);

      const result = await authService.sendOtp('9876543210');

      expect(result.message).toBe('OTP sent successfully');
      expect(result.expiresIn).toBeGreaterThan(0);
      expect(mockOtpRepo.deleteByPhone).toHaveBeenCalledWith('9876543210');
      expect(mockOtpRepo.create).toHaveBeenCalled();
    });

    it('should throw 429 if OTP requested too soon', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue({
        createdAt: new Date(),
      } as never);

      await expectApiError(
        authService.sendOtp('9876543210'),
        StatusCodes.TOO_MANY_REQUESTS,
      );
    });

    it('should allow new OTP after cooldown period', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue({
        createdAt: new Date(Date.now() - 120000),
      } as never);
      mockOtpRepo.deleteByPhone.mockResolvedValue(undefined);
      mockOtpRepo.create.mockResolvedValue({} as never);

      const result = await authService.sendOtp('9876543210');
      expect(result.message).toBe('OTP sent successfully');
    });
  });

  describe('verifyOtp', () => {
    it('should throw 400 when no OTP found', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue(null);

      await expectApiError(
        authService.verifyOtp('9876543210', '123456'),
        StatusCodes.BAD_REQUEST,
      );
    });

    it('should throw 429 when max attempts exceeded', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue({
        attempts: 5,
      } as never);
      mockOtpRepo.deleteByPhone.mockResolvedValue(undefined);

      await expectApiError(
        authService.verifyOtp('9876543210', '123456'),
        StatusCodes.TOO_MANY_REQUESTS,
      );
    });

    it('should throw 400 for wrong OTP and increment attempts', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue({
        otp: '999999',
        attempts: 0,
        _id: 'otp-id',
      } as never);
      mockOtpRepo.incrementAttempts.mockResolvedValue(undefined);

      await expectApiError(
        authService.verifyOtp('9876543210', '123456'),
        StatusCodes.BAD_REQUEST,
      );
      expect(mockOtpRepo.incrementAttempts).toHaveBeenCalledWith('otp-id');
    });

    it('should create new user on first verification', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue({
        otp: '123456',
        attempts: 0,
        _id: 'otp-id',
      } as never);
      mockOtpRepo.deleteByPhone.mockResolvedValue(undefined);
      mockUserRepo.findByPhone.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({
        _id: 'user-id',
        phone: '9876543210',
        role: 'customer',
      } as never);
      mockTokenRepo.create.mockResolvedValue({} as never);

      const result = await authService.verifyOtp('9876543210', '123456');

      expect(result.isNewUser).toBe(true);
      expect(result.user.phone).toBe('9876543210');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should login existing user on correct OTP', async () => {
      mockOtpRepo.findLatestByPhone.mockResolvedValue({
        otp: '123456',
        attempts: 0,
        _id: 'otp-id',
      } as never);
      mockOtpRepo.deleteByPhone.mockResolvedValue(undefined);
      mockUserRepo.findByPhone.mockResolvedValue({
        _id: 'user-id',
        phone: '9876543210',
        role: 'customer',
        isPhoneVerified: true,
      } as never);
      mockUserRepo.updateLastLogin.mockResolvedValue(undefined);
      mockTokenRepo.create.mockResolvedValue({} as never);

      const result = await authService.verifyOtp('9876543210', '123456');

      expect(result.isNewUser).toBe(false);
      expect(result.user._id).toBe('user-id');
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith('user-id');
    });
  });
});
