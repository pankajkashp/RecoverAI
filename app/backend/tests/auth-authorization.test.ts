/**
 * RecoverAI — Authentication, Authorization & Security Tests (Single Business)
 *
 * Tests:
 * 1. Cryptographic JWT authentication (login, token verification, expiration, tampering)
 * 2. Role-based access control (RBAC: ADMIN, MEMBER, VIEWER)
 * 3. Production mode unauthenticated access blocking
 * 4. Webhook provider authentication exception
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { AuthService } from "../src/services/auth.service.js";

const prisma = new PrismaClient();
const app = createApp();
const authService = new AuthService();

describe("Phase 12 — Production Authentication, Authorization & RBAC", () => {
  let adminUserToken: string;
  let viewerUserToken: string;

  beforeAll(async () => {
    // 1. Create Users
    const userAdmin = await prisma.user.create({
      data: {
        id: `user_admin_${Date.now()}`,
        email: `admin-${Date.now()}@example.com`,
        name: "Alice Admin",
        role: "ADMIN",
      },
    });

    const userViewer = await prisma.user.create({
      data: {
        id: `user_viewer_${Date.now()}`,
        email: `viewer-${Date.now()}@example.com`,
        name: "Victor Viewer",
        role: "VIEWER",
      },
    });

    // Generate JWT tokens
    adminUserToken = authService.generateToken({
      id: userAdmin.id,
      email: userAdmin.email,
      name: userAdmin.name,
      role: "ADMIN",
    });

    viewerUserToken = authService.generateToken({
      id: userViewer.id,
      email: userViewer.email,
      name: userViewer.name,
      role: "VIEWER",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // 1. Authentication & JWT Token Handling
  // --------------------------------------------------------------------------
  describe("Authentication API & Token Verification", () => {
    it("authenticates a user via POST /api/auth/login and issues a signed JWT", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "login_test@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user.email).toBe("login_test@example.com");
      expect(res.body.expiresIn).toBe(86400);

      // Verify the generated token can be cryptographically verified
      const verified = authService.verifyToken(res.body.token);
      expect(verified).toBeDefined();
      expect(verified?.email).toBe("login_test@example.com");
    });

    it("returns authenticated profile on GET /api/auth/me with Bearer token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${adminUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe("ADMIN");
    });

    it("rejects GET /api/auth/me when unauthenticated (401)", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects tampered or forged JWT tokens", async () => {
      const tamperedToken = `${adminUserToken}tampered`;
      const verified = authService.verifyToken(tamperedToken);
      expect(verified).toBeNull();
    });

    it("rejects expired JWT tokens", async () => {
      const expiredToken = authService.generateToken(
        {
          id: "expired_user",
          email: "expired@example.com",
          name: "Expired User",
          role: "MEMBER",
        },
        -10 // expired in the past
      );

      const verified = authService.verifyToken(expiredToken);
      expect(verified).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Role-Based Access Control (RBAC)
  // --------------------------------------------------------------------------
  describe("Role-Based Authorization (RBAC)", () => {
    it("allows VIEWER role to read dashboard summary", async () => {
      const res = await request(app)
        .get("/api/dashboard/summary")
        .set("Authorization", `Bearer ${viewerUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("REJECTS VIEWER role from executing recovery attempts (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/recovery-attempts")
        .set("Authorization", `Bearer ${viewerUserToken}`)
        .send({
          paymentEventId: "non_existent_event_id",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Forbidden: Insufficient role permissions");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Webhook Authentication Boundary Exception
  // --------------------------------------------------------------------------
  describe("Webhook Exception", () => {
    it("allows webhook route to bypass user authentication (verified by provider signature)", async () => {
      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .send({ entity: "event" });

      // Expect 400 (missing signature), NOT 401 (missing user auth)
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing X-Razorpay-Signature");
    });
  });
});
