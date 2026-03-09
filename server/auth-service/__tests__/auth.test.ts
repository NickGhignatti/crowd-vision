import {
  authenticateUser,
  registerUser,
} from "../src/services/authenticationService.js";

describe("Authentication Service", () => {
  const mockUser = {
    username: "authTestUser",
    email: "auth@example.com",
    password: "password123",
  };

  describe("1. User Registration", () => {
    it("should create a new user", async () => {
      const createdUser = await registerUser(
        mockUser.username,
        mockUser.email,
        mockUser.password,
      );

      expect(createdUser.email).toContain(mockUser.email);
      expect(createdUser.username).toContain(mockUser.username);
      expect(createdUser.password).not.toContain(mockUser.password);
    });
  });

  describe("2. User Validation", () => {
    it("should validate an existing user with correct password", async () => {
      await registerUser(mockUser.username, mockUser.email, mockUser.password);
      const loggedUser = await authenticateUser(
        mockUser.username,
        mockUser.password,
      );

      expect(loggedUser.email).toContain(mockUser.email);
      expect(loggedUser.username).toContain(mockUser.username);
    });

    it("should reject login with incorrect password", async () => {
      await registerUser(mockUser.username, mockUser.email, mockUser.password);

      await expect(
        authenticateUser(mockUser.username, "wrongpassword"),
      ).rejects.toThrow();
    });

    it("should fail if user does not exist", async () => {
      await expect(authenticateUser("temp", "password")).rejects.toThrow();
    });
  });
});
