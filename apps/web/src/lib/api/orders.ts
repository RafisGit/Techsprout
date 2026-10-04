import { axiosInstance } from '@/lib/axiosInstance';
import type {
  OrderDto,
  CreateOrderRequest,
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  CouponPreviewDto,
  ValidateCouponRequest,
  InvoiceDto,
  PaginatedInvoicesData,
} from '@techsprout/contracts';

/**
 * Validate coupon for a course/order context (Read-Only Preview)
 * POST /api/v1/coupons/validate
 */
export async function validateCoupon(input: ValidateCouponRequest): Promise<CouponPreviewDto> {
  const response = await axiosInstance.post('/api/v1/coupons/validate', {
    code: input.code.trim().toUpperCase(),
    courseId: input.courseId,
  });
  return response.data.data;
}

/**
 * Create server-authoritative order
 * POST /api/v1/orders
 */
export async function createOrder(input: CreateOrderRequest): Promise<OrderDto> {
  const response = await axiosInstance.post('/api/v1/orders', input);
  return response.data.data;
}

/**
 * Initiate payment gateway session
 * POST /api/v1/payments/initiate
 */
export async function initiatePayment(input: InitiatePaymentRequest): Promise<InitiatePaymentResponse> {
  const response = await axiosInstance.post('/api/v1/payments/initiate', input);
  return response.data.data;
}

/**
 * Fetch authoritative order details by ID
 * GET /api/v1/orders/:id
 */
export async function fetchOrderById(orderId: string): Promise<OrderDto> {
  const response = await axiosInstance.get(`/api/v1/orders/${orderId}`);
  return response.data.data;
}

/**
 * Fetch student invoice details by ID
 * GET /api/v1/invoices/:id
 */
export async function fetchInvoiceById(invoiceId: string): Promise<InvoiceDto> {
  const response = await axiosInstance.get(`/api/v1/invoices/${invoiceId}`);
  return response.data.data;
}

/**
 * Fetch invoice for a specific order
 * GET /api/v1/invoices?orderId=:orderId
 */
export async function fetchInvoiceByOrderId(orderId: string): Promise<InvoiceDto | null> {
  const response = await axiosInstance.get<any>('/api/v1/invoices', {
    params: { orderId },
  });
  const data: PaginatedInvoicesData = response.data.data;
  if (data?.items && data.items.length > 0) {
    // Fetch full invoice detail
    return fetchInvoiceById(data.items[0].id);
  }
  return null;
}
