import {
  generateDeviceToken,
  generateStandardToken,
  verifyToken,
} from "../src/services/tokenService.js";
import jwt from "jsonwebtoken";

describe("JWT token system", () => {
  const MOCK_SECRET = "super-secret-test-key";

  beforeAll(() => {
    process.env.JWT_SECRET = MOCK_SECRET;
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe("1. Token generation", () => {
    it("should generate a valid JWT standard token", () => {
      const mockUser = {
        userId: "test-user-id",
        username: "testuser",
      };

      const generatedToken = generateStandardToken(mockUser);

      expect(typeof generatedToken).toBe("string");
    });

    it("should generate a valid JWT device token (API KEY)", () => {
      const mockDevice = {
        domainName: "test-domain",
        buildingId: "test-building-id",
        deviceName: "test-monitor",
        deviceType: "monitor",
        isBuildingSpecific: true,
      };

      const generatedToken = generateDeviceToken(mockDevice);

      expect(typeof generatedToken).toBe("string");

      // decode to verify the contents
      const decoded = jwt.verify(generatedToken, MOCK_SECRET) as any;
      expect(decoded.domainName).toBe(mockDevice.domainName);
      expect(decoded.buildingId).toBe(mockDevice.buildingId);
      expect(decoded.deviceName).toBe(mockDevice.deviceName);
      expect(decoded.deviceType).toBe(mockDevice.deviceType);
      expect(decoded.isBuildingSpecific).toBe(mockDevice.isBuildingSpecific);
    });
  });

  describe("2. Token validation", () => {
    it("should successfully verify and decode a valid token", () => {
      const mockUser = {
        userId: "test-user-id",
        username: "testuser",
      };

      const generatedToken = generateStandardToken(mockUser);

      const decoded = verifyToken(generatedToken) as any;
      expect(decoded.userId).toBe(mockUser.userId);
      expect(decoded.username).toBe(mockUser.username);
    });

    it("should throw an error for a completely fake token string", () => {
      expect(() => {
        verifyToken("not.a.real.token");
      }).toThrow();
    });

    it("should throw an error if the token is signed with the wrong secret", () => {
      const mockUser = {
        userId: "test-user-id",
        username: "testuser",
      };

      const generatedToken = jwt.sign(mockUser, "not-the-real-key", {
        expiresIn: "1d",
      });

      expect(() => {
        verifyToken(generatedToken);
      }).toThrow();
    });

    it("should throw an error if the token is expired", () => {
      const mockUser = {
        userId: "test-user-id",
        username: "testuser",
      };

      const generatedToken = jwt.sign(mockUser, MOCK_SECRET, {
        expiresIn: "-1s",
      });

      expect(() => {
        verifyToken(generatedToken);
      }).toThrow();
    });
  });

  describe("3. Device token limitations", () => {
    it("should allow a monitor token to see only its allowed buildings", () => {});

    it("should deny a monitor token trying to read a different building", () => {});
  });
});
