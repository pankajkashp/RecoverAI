/**
 * RecoverAI — Phase 12: Production Authentication, Authorization & Security Tests
 *
 * Tests:
 * 1. Cryptographic JWT authentication (login, token verification, expiration, tampering)
 * 2. Multi-tenant isolation enforcement (preventing Company A from accessing Company B)
 * 3. Role-based access control (RBAC: ADMIN, MEMBER, VIEWER)
 * 4. Production mode unauthenticated access blocking
 * 5. Webhook provider authentication exception
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
  const companyAId = `comp_auth_a_${Date.now()}`;
  const companyBId = `comp_auth_b_${Date.now()}`;
  let adminUserTokenA: string;
  let viewerUserTokenA: string;
  let adminUserTokenB: string;

  beforeAll(async () => {
    // 1. Create Company A and Users
    await prisma.company.create({
      data: {
        id: companyAId,
        name: "Acme Corp (Company A)",
      },
    });

    const userAdminA = await prisma.user.create({
      data: {
        id: `user_admin_a_${Date.now()}`,
        email: `admin-${Date.now()}@companya.com`,
        name: "Alice Admin",
        role: "ADMIN",
        companyId: companyAId,
      },
    });

    const userViewerA = await prisma.user.create({
      data: {
        id: `user_viewer_a_${Date.now()}`,
        email: `viewer-${Date.now()}@companya.com`,
        name: "Victor Viewer",
        role: "VIEWER",
        companyId: companyAId,
      },
    });

    // 2. Create Company B and User
    await prisma.company.create({
      data: {
        id: companyBId,
        name: "Beta Corp (Company B)",
      },
    });

    const userAdminB = await prisma.user.create({
      data: {
        id: `user_admin_b_${Date.now()}`,
        email: `admin-${Date.now()}@companyb.com`,
        name: "Bob Admin",
        role: "ADMIN",
        companyId: companyBId,
      },
    });

    // Generate JWT tokens
    adminUserTokenA = authService.generateToken({
      id: userAdminA.id,
      email: userAdminA.email,
      name: userAdminA.name,
      role: "ADMIN",
      companyId: companyAId,
    });

    viewerUserTokenA = authService.generateToken({
      id: userViewerA.id,
      email: userViewerA.email,
      name: userViewerA.name,
      role: "VIEWER",
      companyId: companyAId,
    });

    adminUserTokenB = authService.generateToken({
      id: userAdminB.id,
      email: userAdminB.email,
      name: userAdminB.name,
      role: "ADMIN",
      companyId: companyBId,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { companyId: { in: [companyAId, companyBId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
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
        .set("Authorization", `Bearer ${adminUserTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.companyId).toBe(companyAId);
      expect(res.body.user.role).toBe("ADMIN");
      expect(res.body.tenant.companyId).toBe(companyAId);
    });

    it("rejects GET /api/auth/me when unauthenticated (401)", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects tampered or forged JWT tokens", async () => {
      const tamperedToken = `${adminUserTokenA}tampered`;
      const verified = authService.verifyToken(tamperedToken);
      expect(verified).toBeNull();
    });

    it("rejects expired JWT tokens", async () => {
      // Generate token expired 10 seconds ago
      const expiredToken = authService.generateToken(
        {
          id: "expired_user",
          email: "expired@example.com",
          name: "Expired User",
          role: "MEMBER",
          companyId: companyAId,
        },
        -10 // expired in the past
      );

      const verified = authService.verifyToken(expiredToken);
      expect(verified).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Multi-Tenant Data Isolation
  // --------------------------------------------------------------------------
  describe("Multi-Tenant Isolation", () => {
    it("allows Company A user to query Company A dashboard", async () => {
      const res = await request(app)
        .get(`/api/dashboard/summary?companyId=${companyAId}`)
        .set("Authorization", `Bearer ${adminUserTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.company.id).toBe(companyAId);
    });

    it("STRICTLY REJECTS Company A user attempting to access Company B data (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/dashboard/summary?companyId=${companyBId}`)
        .set("Authorization", `Bearer ${adminUserTokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Tenant isolation violation");
    });

    it("STRICTLY REJECTS Company B user attempting to access Company A data (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/dashboard/summary?companyId=${companyAId}`)
        .set("Authorization", `Bearer ${adminUserTokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Tenant isolation violation");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Role-Based Access Control (RBAC)
  // --------------------------------------------------------------------------
  describe("Role-Based Authorization (RBAC)", () => {
    it("allows VIEWER role to read dashboard summary", async () => {
      const res = await request(app)
        .get(`/api/dashboard/summary?companyId=${companyAId}`)
        .set("Authorization", `Bearer ${viewerUserTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("REJECTS VIEWER role from executing recovery attempts (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/recovery-attempts")
        .set("Authorization", `Bearer ${viewerUserTokenA}`)
        .send({
          paymentEventId: "non_existent_event_id",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Forbidden: Insufficient role permissions");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Webhook Authentication Boundary Exception
  // --------------------------------------------------------------------------
  describe("Webhook Exception", () => {
    it("allows webhook route to bypass user authentication (verified by provider signature)", async () => {
      // POST /api/webhooks/razorpay without Bearer token reaches the webhook signature handler
      const res = await request(app)
        .post("/api/webhooks/razorpay")
        .send({ entity: "event" });

      // Expect 400 (missing signature), NOT 401 (missing user auth)
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing X-Razorpay-Signature");
    });
  });
});
