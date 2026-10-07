import { axiosInstance } from '@/lib/axiosInstance';
import type {
  FinanceSummaryDto,
  OrderDto,
  OrderListQuery,
  PaginatedOrdersData,
  PaymentListItemDto,
  RefundDto,
  RefundListQuery,
  PaginatedRefundsData,
  AdminReconcileRefundRequest,
  ReconciliationQuery,
  ReconciliationResultDto,
  CouponDto,
  CouponListQuery,
  PaginatedCouponsData,
  CreateCouponRequest,
  UpdateCouponRequest,
  RefundRequestListQuery,
  PaginatedRefundRequestsData,
  RefundRequestDto,
  AdminApproveRefundRequestRequest,
  AdminRejectRefundRequestRequest,
  ProcessApprovedRefundsResultDto,
  FinanceExportQuery,
} from '@techsprout/contracts';

/**
 * Format integer minor units (cents / poisha) to human-readable BDT.
 * e.g., 12500000 -> "BDT 125,000.00"
 */
export function formatBDT(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || isNaN(cents)) {
    return 'BDT 0.00';
  }
  const bdt = cents / 100;
  return `BDT ${bdt.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ==========================================
// 1. FINANCE DASHBOARD API
// ==========================================

export async function fetchFinanceSummary(): Promise<FinanceSummaryDto> {
  const response = await axiosInstance.get('/api/v1/admin/finance/summary');
  return response.data.data;
}

// ==========================================
// 2. ADMIN ORDERS EXPLORER API
// ==========================================

export async function fetchAdminOrders(query: OrderListQuery = {}): Promise<PaginatedOrdersData> {
  const response = await axiosInstance.get('/api/v1/admin/orders', {
    params: query,
  });
  return response.data.data;
}

export async function fetchAdminOrderById(orderId: string): Promise<OrderDto> {
  const response = await axiosInstance.get(`/api/v1/admin/orders/${orderId}`);
  return response.data.data;
}

export async function fetchOrderPayments(orderId: string): Promise<PaymentListItemDto[]> {
  const response = await axiosInstance.get('/api/v1/payments', {
    params: { orderId },
  });
  return response.data.data.items || [];
}

// ==========================================
// 3. REFUNDS & RECONCILIATION API
// ==========================================

export async function fetchAdminRefunds(query: RefundListQuery = {}): Promise<PaginatedRefundsData> {
  const response = await axiosInstance.get('/api/v1/admin/refunds', {
    params: query,
  });
  return response.data.data;
}

export async function fetchAdminRefundById(refundId: string): Promise<RefundDto> {
  const response = await axiosInstance.get(`/api/v1/admin/refunds/${refundId}`);
  return response.data.data;
}

export async function initiateRefund(orderId: string, reason: string): Promise<RefundDto> {
  const response = await axiosInstance.post(`/api/v1/admin/orders/${orderId}/refund`, {
    reason: reason.trim(),
  });
  return response.data.data;
}

export async function queryRefundStatus(refundId: string): Promise<RefundDto> {
  const response = await axiosInstance.post(`/api/v1/admin/refunds/${refundId}/query`);
  return response.data.data;
}

export async function reconcileRefund(
  refundId: string,
  payload: AdminReconcileRefundRequest
): Promise<RefundDto> {
  const response = await axiosInstance.post(
    `/api/v1/admin/refunds/${refundId}/reconcile`,
    payload
  );
  return response.data.data;
}

export async function scanReconciliation(
  query: ReconciliationQuery = {}
): Promise<ReconciliationResultDto> {
  const response = await axiosInstance.post('/api/v1/admin/reconciliation/scan', query);
  return response.data.data;
}

// ==========================================
// 4. ADMIN COUPONS API
// ==========================================

export async function fetchAdminCoupons(query: CouponListQuery = {}): Promise<PaginatedCouponsData> {
  const response = await axiosInstance.get('/api/v1/admin/coupons', {
    params: query,
  });
  return response.data.data;
}

export async function fetchAdminCouponById(couponId: string): Promise<CouponDto> {
  const response = await axiosInstance.get(`/api/v1/admin/coupons/${couponId}`);
  return response.data.data;
}

export async function createAdminCoupon(data: CreateCouponRequest): Promise<CouponDto> {
  const response = await axiosInstance.post('/api/v1/admin/coupons', data);
  return response.data.data;
}

export async function updateAdminCoupon(
  couponId: string,
  data: UpdateCouponRequest
): Promise<CouponDto> {
  const response = await axiosInstance.patch(`/api/v1/admin/coupons/${couponId}`, data);
  return response.data.data;
}

export async function deleteAdminCoupon(couponId: string): Promise<CouponDto> {
  const response = await axiosInstance.delete(`/api/v1/admin/coupons/${couponId}`);
  return response.data.data;
}

// ==========================================
// 5. ADMIN REFUND REQUESTS QUEUE API
// ==========================================

export async function fetchAdminRefundRequests(
  query: RefundRequestListQuery = {}
): Promise<PaginatedRefundRequestsData> {
  const response = await axiosInstance.get('/api/v1/admin/refund-requests', {
    params: query,
  });
  return response.data.data;
}

export async function fetchAdminRefundRequestById(
  requestId: string
): Promise<RefundRequestDto> {
  const response = await axiosInstance.get(`/api/v1/admin/refund-requests/${requestId}`);
  return response.data.data;
}

export async function approveRefundRequest(
  requestId: string,
  input: AdminApproveRefundRequestRequest = {}
): Promise<RefundRequestDto> {
  const response = await axiosInstance.post(
    `/api/v1/admin/refund-requests/${requestId}/approve`,
    input
  );
  return response.data.data;
}

export async function rejectRefundRequest(
  requestId: string,
  input: AdminRejectRefundRequestRequest
): Promise<RefundRequestDto> {
  const response = await axiosInstance.post(
    `/api/v1/admin/refund-requests/${requestId}/reject`,
    input
  );
  return response.data.data;
}

export async function executeAdminRefundRequest(
  requestId: string
): Promise<RefundDto> {
  const response = await axiosInstance.post(
    `/api/v1/admin/refund-requests/${requestId}/execute`
  );
  return response.data.data;
}

export async function processApprovedRefundRequests(
  limit: number = 50
): Promise<ProcessApprovedRefundsResultDto> {
  const response = await axiosInstance.post(
    '/api/v1/admin/refund-requests/process-approved',
    { limit }
  );
  return response.data.data;
}

export async function fetchApprovedUnprocessedRefundRequests(
  limit: number = 50
): Promise<RefundRequestDto[]> {
  const response = await axiosInstance.get(
    '/api/v1/admin/refund-requests/approved-unprocessed',
    { params: { limit } }
  );
  return response.data.data;
}

/**
 * Download authoritative financial transactions as a streaming CSV Blob
 * GET /api/v1/admin/finance/export
 */
export async function downloadFinanceCsvBlob(
  query: FinanceExportQuery
): Promise<{ blob: Blob; filename: string }> {
  const response = await axiosInstance.get('/api/v1/admin/finance/export', {
    params: query,
    responseType: 'blob',
  });

  let filename = `techsprout-${query.type}-export.csv`;
  const disposition = response.headers?.['content-disposition'];
  if (disposition) {
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].trim();
    }
  }

  return {
    blob: response.data,
    filename,
  };
}


