import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SubscriptionBillingWorker,
  SUBSCRIPTION_BILLING_QUEUE_NAME,
  RENEWAL_SCHEDULER_ID,
  DUNNING_SCHEDULER_ID,
  RENEWAL_JOB_NAME,
  DUNNING_JOB_NAME,
  DAILY_RENEWAL_CRON,
  DAILY_DUNNING_CRON,
} from './subscription-billing.worker';
import { SubscriptionBillingService } from './subscription-billing.service';

describe('SubscriptionBillingWorker', () => {
  let mockBillingService: any;
  let worker: SubscriptionBillingWorker;

  beforeEach(() => {
    mockBillingService = {
      processDueRenewals: vi.fn(async () => ({
        processed: 2,
        succeeded: 2,
        failed: 0,
        skipped: 0,
        results: [],
      })),
      processDunningRetries: vi.fn(async () => ({
        processed: 1,
        recovered: 1,
        retried: 0,
        suspended: 0,
        skipped: 0,
        results: [],
      })),
    };

    worker = new SubscriptionBillingWorker(mockBillingService as SubscriptionBillingService);
  });

  describe('Configuration & Constants', () => {
    it('defines explicit queue and scheduler constants matching TechSprout standards', () => {
      expect(SUBSCRIPTION_BILLING_QUEUE_NAME).toBe('techsprout-subscription-billing');
      expect(RENEWAL_SCHEDULER_ID).toBe('subscription-renewal-daily');
      expect(DUNNING_SCHEDULER_ID).toBe('subscription-dunning-retry');
      expect(DAILY_RENEWAL_CRON).toBe('0 2 * * *');
      expect(DAILY_DUNNING_CRON).toBe('0 6 * * *');
    });
  });

  describe('Job Execution & Dispatching', () => {
    it('routes process-renewals job to billingService.processDueRenewals', async () => {
      const mockJob: any = {
        name: RENEWAL_JOB_NAME,
        id: 'job-renewal-1',
        data: {},
      };

      const result = await worker.processJob(mockJob);

      expect(mockBillingService.processDueRenewals).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          processed: 2,
          succeeded: 2,
        })
      );

      const health = worker.getHealthDetails();
      expect(health.lastRenewalRun).toBeDefined();
      expect(health.lastRenewalRun?.result).toEqual(result);
    });

    it('routes process-dunning job to billingService.processDunningRetries', async () => {
      const mockJob: any = {
        name: DUNNING_JOB_NAME,
        id: 'job-dunning-1',
        data: {},
      };

      const result = await worker.processJob(mockJob);

      expect(mockBillingService.processDunningRetries).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          processed: 1,
          recovered: 1,
        })
      );

      const health = worker.getHealthDetails();
      expect(health.lastDunningRun).toBeDefined();
      expect(health.lastDunningRun?.result).toEqual(result);
    });

    it('gracefully handles unknown job names without throwing', async () => {
      const mockJob: any = {
        name: 'unrecognized-job',
        id: 'job-unknown-1',
        data: {},
      };

      const result = await worker.processJob(mockJob);

      expect(result).toEqual({ skipped: true, reason: 'Unknown job name' });
      expect(mockBillingService.processDueRenewals).not.toHaveBeenCalled();
      expect(mockBillingService.processDunningRetries).not.toHaveBeenCalled();
    });
  });

  describe('Scheduler Registration & Lifecycle', () => {
    it('registers both daily renewal and dunning schedulers on BullMQ queue', async () => {
      const mockQueue: any = {
        upsertJobScheduler: vi.fn(async () => {}),
      };

      (worker as any).queue = mockQueue;
      (worker as any).isConnected = true;

      await worker.registerDailySchedulers();

      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        RENEWAL_SCHEDULER_ID,
        { pattern: DAILY_RENEWAL_CRON },
        { name: RENEWAL_JOB_NAME, data: {} }
      );
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        DUNNING_SCHEDULER_ID,
        { pattern: DAILY_DUNNING_CRON },
        { name: DUNNING_JOB_NAME, data: {} }
      );

      const health = worker.getHealthDetails();
      expect(health.isSchedulerRegistered).toBe(true);
    });

    it('reports correct health status based on connection and closing flags', async () => {
      expect(worker.getStatus()).toBe('degraded');

      (worker as any).isConnected = true;
      (worker as any).worker = { close: vi.fn(async () => {}) } as any;
      expect(worker.getStatus()).toBe('ready');

      await worker.onModuleDestroy();
      expect(worker.getStatus()).toBe('disabled');
    });

    it('triggers manual ad-hoc renewal and dunning jobs', async () => {
      const renewalRes = await worker.triggerRenewalJob();
      expect(mockBillingService.processDueRenewals).toHaveBeenCalledTimes(1);
      expect(renewalRes.processed).toBe(2);

      const dunningRes = await worker.triggerDunningJob();
      expect(mockBillingService.processDunningRetries).toHaveBeenCalledTimes(1);
      expect(dunningRes.processed).toBe(1);
    });
  });
});
