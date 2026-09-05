/**
 * RecoverAI — Dashboard Event Bus Service
 *
 * Provides in-process pub/sub event broadcasting for real-time,
 * event-driven dashboard updates for the single-business RecoverAI application.
 */

import { EventEmitter } from "node:events";

export type DashboardEventType =
  | "PAYMENT_PROCESSED"
  | "RECOVERY_EXECUTED"
  | "RECOVERY_CONFIRMED"
  | "TRANSACTION_UPDATED"
  | "DEMO_RESET";

export interface DashboardEventPayload {
  type: DashboardEventType;
  companyId?: string;
  paymentEventId?: string;
  businessTransactionId?: string;
  recoveryAttemptId?: string;
  recoveryOutcomeId?: string;
  status?: string;
  actualRecoveredAmount?: number | null;
  timestamp: string;
  [key: string]: unknown;
}

export class DashboardEventService extends EventEmitter {
  private static instance: DashboardEventService;

  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  public static getInstance(): DashboardEventService {
    if (!DashboardEventService.instance) {
      DashboardEventService.instance = new DashboardEventService();
    }
    return DashboardEventService.instance;
  }

  public emitDashboardEvent(event: DashboardEventPayload): void {
    this.emit("dashboard_event", event);
    if (event.companyId) {
      this.emit(`company_${event.companyId}`, event);
    }
  }

  public subscribe(listener: (event: DashboardEventPayload) => void): () => void {
    this.on("dashboard_event", listener);
    return () => {
      this.off("dashboard_event", listener);
    };
  }

  public subscribeCompany(
    companyId: string,
    listener: (event: DashboardEventPayload) => void
  ): () => void {
    const channel = `company_${companyId}`;
    this.on(channel, listener);
    this.on("dashboard_event", listener);
    return () => {
      this.off(channel, listener);
      this.off("dashboard_event", listener);
    };
  }
}

export const dashboardEventService = DashboardEventService.getInstance();
