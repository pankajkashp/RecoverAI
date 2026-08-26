/**
 * RecoverAI — Security & Compliance Audit Service
 *
 * Phase 12: Production Authentication, Authorization & Deployment Readiness
 *
 * Records structured security and audit logs for sensitive operations
 * (login, role authorization failures, cross-tenant attempts, recovery execution).
 * Never leaks card details, passwords, or authentication secrets.
 */

export interface AuditEntry {
  userId?: string;
  companyId?: string;
  role?: string;
  action: string;
  resource?: string;
  status: "SUCCESS" | "DENIED" | "FAILED";
  requestId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  private static instance: AuditService;

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Records a security audit event to structured logs.
   */
  public log(entry: AuditEntry): void {
    const timestamp = new Date().toISOString();
    const sanitizedMetadata = entry.metadata
      ? this.sanitizeMetadata(entry.metadata)
      : undefined;

    const logRecord = {
      type: "AUDIT_EVENT",
      timestamp,
      ...entry,
      metadata: sanitizedMetadata,
    };

    // Output structured audit log
    console.info(JSON.stringify(logRecord));
  }

  /**
   * Sanitizes metadata to strip sensitive fields.
   */
  private sanitizeMetadata(
    meta: Record<string, unknown>
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const blacklistedKeys = [
      "password",
      "secret",
      "token",
      "cvv",
      "cardnumber",
      "apikey",
    ];

    for (const [key, value] of Object.entries(meta)) {
      if (blacklistedKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
