// =============================================================================
// UNIT TESTS — AuthService
// =============================================================================
//
// WHAT ARE WE TESTING?
// The AuthService class in src/services/auth.service.ts
//
// WHAT IS A UNIT TEST?
// A unit test tests ONE class/function in complete isolation.
// We "mock" (fake) every external dependency so:
//   - No real database is hit
//   - No real Firebase call is made
//   - Tests run in milliseconds
//   - Results are 100% predictable
//
// WHAT ARE MOCKS?
// A mock replaces a real object with a fake one that YOU control.
// Example: instead of calling real Firebase, we replace it with a function
// that returns whatever we tell it to — success or failure.
//
// WHY MOCK?
// The AuthService has two dependencies: UserRepository and TokenRepository.
// We don't want to test those here (they have their own tests).
// We only want to test the LOGIC inside AuthService itself.
// =============================================================================

import { AuthService } from '../../../src/services/auth.service';
import { UserRepository } from '../../../src/repositories/user.repository';
import { TokenRepository } from '../../../src/repositories/token.repository';
import { IDeviceInfo } from '../../../src/models/token.model';
import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../../../src/utils/api-error';

// -----------------------------------------------------------------------------
// MOCK SETUP
// -----------------------------------------------------------------------------
// `jest.mock(path)` replaces the entire module with auto-generated mocks.
// Every function in that module becomes a Jest "spy" that:
//   - Does nothing by default (returns undefined)
//   - Records every call (so we can assert it WAS called)
//   - Can be configured to return specific values per test
jest.mock('../../../src/repositories/user.repository');
jest.mock('../../../src/repositories/token.repository');

// We also need to mock Firebase — AuthService calls `getFirebaseAuth()`
// which would fail in tests (no real Firebase credentials).
// We replace it with a factory that returns a fake firebase auth object.
jest.mock('../../../src/loaders', () => ({
  getFirebaseAuth: jest.fn(),
}));

// Import the mocked version so we can control its return value per test
import { getFirebaseAuth } from '../../../src/loaders';

// -----------------------------------------------------------------------------
// HELPER — assert an ApiError with a specific status code was thrown
// -----------------------------------------------------------------------------
const expectApiError = async (promise: Promise<unknown>, statusCode: number) => {
  try {
    await promise;
    fail('Expected error to be thrown but it did not');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
  }
};

// -----------------------------------------------------------------------------
// FIXTURE — a fake DeviceInfo used in every test
// -----------------------------------------------------------------------------
// verifyFirebaseToken and refreshToken now require device info so we can
// associate each session with the device that created it.
const mockDeviceInfo: IDeviceInfo = {
  userAgent:  'Mozilla/5.0 (Test)',
  ip:         '127.0.0.1',
  browser:    'Chrome 120',
  os:         'Windows',
  deviceType: 'desktop',
  deviceName: 'Chrome 120 on Windows',
};

// =============================================================================
// TEST SUITE
// =============================================================================
describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockTokenRepo: jest.Mocked<TokenRepository>;
  let mockFirebaseAuth: { verifyIdToken: jest.Mock };

  // `beforeEach` runs before EVERY single test case (`it(...)` block).
  // We reset everything to a clean state so tests don't affect each other.
  beforeEach(() => {
    jest.clearAllMocks();

    // Create typed mock instances
    mockUserRepo  = new UserRepository()  as jest.Mocked<UserRepository>;
    mockTokenRepo = new TokenRepository() as jest.Mocked<TokenRepository>;

    // AuthService now accepts repositories as constructor parameters (Dependency Injection).
    // This is cleaner than reaching into private properties — we pass our mocks directly.
    authService = new AuthService(mockUserRepo, mockTokenRepo);

    // Set up mock Firebase auth
    mockFirebaseAuth = { verifyIdToken: jest.fn() };
    (getFirebaseAuth as jest.Mock).mockReturnValue(mockFirebaseAuth);
  });

  // ===========================================================================
  // verifyFirebaseToken()
  // ===========================================================================
  // This method:
  //   1. Calls Firebase to verify the token
  //   2. Extracts the phone number
  //   3. Creates or finds the user in our DB
  //   4. Issues our own JWT access + refresh tokens
  describe('verifyFirebaseToken', () => {

    it('should throw 401 when Firebase token is invalid', async () => {
      // Arrange — make Firebase throw an error (simulating an invalid/expired token)
      mockFirebaseAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      // Act + Assert — call the method and expect it to throw a 401
      await expectApiError(
        authService.verifyFirebaseToken('bad-token', mockDeviceInfo),
        StatusCodes.UNAUTHORIZED,
      );
    });

    it('should throw 400 when Firebase token has no phone number', async () => {
      // Arrange — Firebase succeeds but decoded token has no phone_number
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        phone_number: undefined,
        uid: 'firebase-uid-123',
      });

      // Act + Assert
      await expectApiError(
        authService.verifyFirebaseToken('token-without-phone', mockDeviceInfo),
        StatusCodes.BAD_REQUEST,
      );
    });

    it('should create a new user and return tokens on first login', async () => {
      // Arrange — Firebase returns a valid decoded token
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        phone_number: '+919876543210',
        uid: 'firebase-uid-123',
      });

      // The user doesn't exist in our DB yet → findByPhone returns null
      mockUserRepo.findByPhone.mockResolvedValue(null);

      // Simulate successful user creation
      mockUserRepo.create.mockResolvedValue({
        _id: { toString: () => 'user-id-abc' },
        phone: '9876543210',
        role: 'customer',
        firstName: undefined,
        lastName: undefined,
      } as never);

      mockTokenRepo.create.mockResolvedValue({} as never);

      // Act
      const result = await authService.verifyFirebaseToken('valid-firebase-token', mockDeviceInfo);

      // Assert — check the shape of the result
      expect(result.isNewUser).toBe(true);
      expect(result.user.phone).toBe('9876543210');
      expect(result.user.role).toBe('customer');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Verify the user was actually created (not just looked up)
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '9876543210', isPhoneVerified: true }),
      );
    });

    it('should log in an existing user and update lastLogin', async () => {
      // Arrange — Firebase returns valid token
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        phone_number: '+919876543210',
        uid: 'firebase-uid-123',
      });

      // This time the user DOES exist in our DB
      mockUserRepo.findByPhone.mockResolvedValue({
        _id: { toString: () => 'existing-user-id' },
        phone: '9876543210',
        role: 'customer',
        isPhoneVerified: true,
        isActive: true,
      } as never);

      mockUserRepo.updateLastLogin.mockResolvedValue(undefined as never);
      mockTokenRepo.create.mockResolvedValue({} as never);

      // Act
      const result = await authService.verifyFirebaseToken('valid-firebase-token', mockDeviceInfo);

      // Assert
      expect(result.isNewUser).toBe(false);
      expect(result.user._id).toBe('existing-user-id');
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith('existing-user-id');
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('should strip +91 country code from phone number', async () => {
      // Arrange
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        phone_number: '+919876543210',
        uid: 'uid',
      });
      mockUserRepo.findByPhone.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({
        _id: { toString: () => 'id' },
        phone: '9876543210',
        role: 'customer',
      } as never);
      mockTokenRepo.create.mockResolvedValue({} as never);

      // Act
      await authService.verifyFirebaseToken('token', mockDeviceInfo);

      // Assert — the phone stored must NOT include +91
      expect(mockUserRepo.findByPhone).toHaveBeenCalledWith('9876543210');
    });
  });

  // ===========================================================================
  // refreshToken()
  // ===========================================================================
  // This method:
  //   1. Hashes the refresh token and looks it up in DB
  //   2. Checks the user is still active
  //   3. Deletes the old token (rotation — each refresh token can only be used once)
  //   4. Issues a fresh pair of tokens
  describe('refreshToken', () => {

    it('should throw 401 when refresh token is not found in DB', async () => {
      // Arrange — no token record found
      mockTokenRepo.findByToken.mockResolvedValue(null);

      // Act + Assert
      await expectApiError(
        authService.refreshToken('invalid-refresh-token', mockDeviceInfo),
        StatusCodes.UNAUTHORIZED,
      );
    });

    it('should throw 401 when user is inactive (banned)', async () => {
      // Arrange — token exists in DB
      mockTokenRepo.findByToken.mockResolvedValue({
        token: 'hashed-token',
        user:  { toString: () => 'user-id' },
      } as never);

      // But user is banned (isActive: false)
      mockUserRepo.findById.mockResolvedValue({
        _id:      { toString: () => 'user-id' },
        isActive: false,
      } as never);

      // Act + Assert — banned user cannot refresh tokens
      await expectApiError(
        authService.refreshToken('some-refresh-token', mockDeviceInfo),
        StatusCodes.UNAUTHORIZED,
      );
    });

    it('should rotate token and return new tokens for valid refresh', async () => {
      // Arrange — valid token and active user
      mockTokenRepo.findByToken.mockResolvedValue({
        token: 'hashed-token',
        user:  { toString: () => 'user-id' },
      } as never);

      mockUserRepo.findById.mockResolvedValue({
        _id:      { toString: () => 'user-id' },
        role:     'customer',
        isActive: true,
      } as never);

      mockTokenRepo.deleteByToken.mockResolvedValue(undefined as never);
      mockTokenRepo.create.mockResolvedValue({} as never);

      // Act
      const result = await authService.refreshToken('valid-refresh-token', mockDeviceInfo);

      // Assert — new tokens are issued
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Old token must be deleted (token rotation security pattern)
      expect(mockTokenRepo.deleteByToken).toHaveBeenCalled();

      // A new token record must be stored with deviceInfo
      expect(mockTokenRepo.create).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // logout()
  // ===========================================================================
  describe('logout', () => {

    it('should delete the refresh token on logout', async () => {
      mockTokenRepo.deleteByToken.mockResolvedValue(undefined as never);

      await authService.logout('some-refresh-token');

      expect(mockTokenRepo.deleteByToken).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // logoutAll()
  // ===========================================================================
  describe('logoutAll', () => {

    it('should delete all tokens for the user', async () => {
      mockTokenRepo.deleteByUserId.mockResolvedValue(undefined as never);

      await authService.logoutAll('user-id-xyz');

      expect(mockTokenRepo.deleteByUserId).toHaveBeenCalledWith('user-id-xyz');
    });
  });
});
