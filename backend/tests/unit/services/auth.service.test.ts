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
// This is a reusable pattern: call a function, expect it to throw,
// and verify it threw the right kind of error with the right status code.
const expectApiError = async (promise: Promise<unknown>, statusCode: number) => {
  try {
    await promise;
    fail('Expected error to be thrown but it did not');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
  }
};

// =============================================================================
// TEST SUITE
// =============================================================================
// `describe` groups related tests together — think of it as a folder.
// The outer describe is the class, inner describes are the methods.
describe('AuthService', () => {
  // These variables hold our service and its mocked dependencies
  let authService: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockTokenRepo: jest.Mocked<TokenRepository>;
  let mockFirebaseAuth: { verifyIdToken: jest.Mock };

  // `beforeEach` runs before EVERY single test case (`it(...)` block).
  // We reset everything to a clean state so tests don't affect each other.
  beforeEach(() => {
    // Clear all mock call history and return values
    jest.clearAllMocks();

    // Create a fresh AuthService — its constructor creates UserRepo + TokenRepo
    // but since we mocked those modules above, it gets fake versions automatically
    authService = new AuthService();

    // Reach into the private properties of AuthService to get the mock instances.
    // TypeScript doesn't allow accessing private properties directly,
    // so we cast to `unknown` first, then to the shape we need.
    mockUserRepo = (authService as unknown as { userRepo: jest.Mocked<UserRepository> }).userRepo;
    mockTokenRepo = (authService as unknown as { tokenRepo: jest.Mocked<TokenRepository> }).tokenRepo;

    // Set up the mock Firebase auth object with a mock `verifyIdToken` function
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
        authService.verifyFirebaseToken('bad-token'),
        StatusCodes.UNAUTHORIZED,
      );
    });

    it('should throw 400 when Firebase token has no phone number', async () => {
      // Arrange — Firebase succeeds but the decoded token has no phone_number
      // This happens if the user authenticated with email, not phone
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        phone_number: undefined, // no phone
        uid: 'firebase-uid-123',
      });

      // Act + Assert
      await expectApiError(
        authService.verifyFirebaseToken('token-without-phone'),
        StatusCodes.BAD_REQUEST,
      );
    });

    it('should create a new user and return tokens on first login', async () => {
      // Arrange — Firebase returns a valid decoded token with a phone number
      mockFirebaseAuth.verifyIdToken.mockResolvedValue({
        phone_number: '+919876543210', // Indian format with country code
        uid: 'firebase-uid-123',
      });

      // The user doesn't exist in our DB yet → findByPhone returns null
      mockUserRepo.findByPhone.mockResolvedValue(null);

      // Simulate successful user creation — return a fake user object
      mockUserRepo.create.mockResolvedValue({
        _id: { toString: () => 'user-id-abc' },
        phone: '9876543210', // stripped of +91
        role: 'customer',
        firstName: undefined,
        lastName: undefined,
      } as never);

      // Token storage succeeds
      mockTokenRepo.create.mockResolvedValue({} as never);

      // Act
      const result = await authService.verifyFirebaseToken('valid-firebase-token');

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
      const result = await authService.verifyFirebaseToken('valid-firebase-token');

      // Assert
      expect(result.isNewUser).toBe(false); // existing user, not new
      expect(result.user._id).toBe('existing-user-id');

      // Verify lastLogin was updated
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith('existing-user-id');

      // Verify we did NOT create a new user
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
      await authService.verifyFirebaseToken('token');

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
      // Arrange — no token record found (token is invalid or already used)
      mockTokenRepo.findByToken.mockResolvedValue(null);

      // Act + Assert
      await expectApiError(
        authService.refreshToken('invalid-refresh-token'),
        StatusCodes.UNAUTHORIZED,
      );
    });

    it('should throw 401 when user is inactive (banned)', async () => {
      // Arrange — token exists in DB
      mockTokenRepo.findByToken.mockResolvedValue({
        token: 'hashed-token',
        user: { toString: () => 'user-id' },
      } as never);

      // But user is banned (isActive: false)
      mockUserRepo.findById.mockResolvedValue({
        _id: { toString: () => 'user-id' },
        isActive: false, // ← BANNED
      } as never);

      // Act + Assert — banned user cannot refresh tokens
      await expectApiError(
        authService.refreshToken('some-refresh-token'),
        StatusCodes.UNAUTHORIZED,
      );
    });

    it('should rotate token and return new tokens for valid refresh', async () => {
      // Arrange — valid token and active user
      mockTokenRepo.findByToken.mockResolvedValue({
        token: 'hashed-token',
        user: { toString: () => 'user-id' },
      } as never);

      mockUserRepo.findById.mockResolvedValue({
        _id: { toString: () => 'user-id' },
        role: 'customer',
        isActive: true,
      } as never);

      mockTokenRepo.deleteByToken.mockResolvedValue(undefined as never);
      mockTokenRepo.create.mockResolvedValue({} as never);

      // Act
      const result = await authService.refreshToken('valid-refresh-token');

      // Assert — new tokens are issued
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Old token must be deleted (token rotation security pattern)
      expect(mockTokenRepo.deleteByToken).toHaveBeenCalled();

      // A new token record must be stored
      expect(mockTokenRepo.create).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // logout()
  // ===========================================================================
  describe('logout', () => {

    it('should delete the refresh token on logout', async () => {
      // Arrange
      mockTokenRepo.deleteByToken.mockResolvedValue(undefined as never);

      // Act
      await authService.logout('some-refresh-token');

      // Assert — the hashed token was deleted from DB
      // We don't test the exact hash (that's an implementation detail)
      // — we just verify deleteByToken was called once
      expect(mockTokenRepo.deleteByToken).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // logoutAll()
  // ===========================================================================
  describe('logoutAll', () => {

    it('should delete all tokens for the user', async () => {
      // Arrange
      mockTokenRepo.deleteByUserId.mockResolvedValue(undefined as never);

      // Act
      await authService.logoutAll('user-id-xyz');

      // Assert — all sessions wiped for this user
      expect(mockTokenRepo.deleteByUserId).toHaveBeenCalledWith('user-id-xyz');
    });
  });
});
