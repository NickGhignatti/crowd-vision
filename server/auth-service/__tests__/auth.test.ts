import {
  authenticateAccount,
  registerAccount,
} from "../src/services/authenticationService.js";

describe("Authentication Service", () => {
  const mockAccount = {
    name: "authTestUser",
    email: "auth@example.com",
    password: "password123",
  };

  describe("1. Account Registration", () => {
    it("should create a new Account", async () => {
      const createdUser = await registerAccount(
        mockAccount.name,
        mockAccount.email,
        mockAccount.password,
      );

      expect(createdUser.email).toContain(mockAccount.email);
      expect(createdUser.name).toContain(mockAccount.name);
      expect(createdUser.password).not.toContain(mockAccount.password);
    });
  });

  describe("2. Account Validation", () => {
    it("should validate an existing Account with correct password", async () => {
      await registerAccount(mockAccount.name, mockAccount.email, mockAccount.password);
      const loggedUser = await authenticateAccount(
        mockAccount.name,
        mockAccount.password,
      );

      expect(loggedUser.email).toContain(mockAccount.email);
      expect(loggedUser.name).toContain(mockAccount.name);
    });

    it("should reject login with incorrect password", async () => {
      await registerAccount(mockAccount.name, mockAccount.email, mockAccount.password);

      await expect(
        authenticateAccount(mockAccount.name, "wrongpassword"),
      ).rejects.toThrow();
    });

    it("should fail if Account does not exist", async () => {
      await expect(authenticateAccount("temp", "password")).rejects.toThrow();
    });
  });
});
