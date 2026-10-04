import { Logger } from '@nestjs/common';

export interface SSLCommerzInitiateSessionParams {
  total_amount: string;
  currency: string;
  tran_id: string;
  success_url: string;
  fail_url: string;
  cancel_url: string;
  ipn_url: string;
  cus_name: string;
  cus_email: string;
  cus_phone?: string;
  product_name: string;
  product_category?: string;
}

export interface SSLCommerzSessionResponse {
  status: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
  [key: string]: unknown;
}

export interface SSLCommerzOrderValidationResponse {
  status: string;
  tran_id: string;
  val_id: string;
  amount: string;
  currency: string;
  bank_tran_id?: string;
  card_type?: string;
  card_brand?: string;
  card_issuer?: string;
  card_sub_brand?: string;
  card_issuer_country?: string;
  store_amount?: string;
  tran_date?: string;
  error?: string;
  [key: string]: unknown;
}

export interface SSLCommerzTransactionQueryResponse {
  APIConnect?: string;
  status?: string;
  element?: Array<{
    tran_id: string;
    val_id?: string;
    amount?: string;
    currency?: string;
    status?: string;
    bank_tran_id?: string;
    card_type?: string;
    card_brand?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SSLCommerzInitiateRefundParams {
  bank_tran_id: string;
  refund_trans_id: string;
  refund_amount: string;
  refund_remarks: string;
  refe_id?: string;
}

export interface SSLCommerzRefundResponse {
  APIConnect?: string;
  status: string;
  refund_ref_id?: string;
  errorReason?: string;
  [key: string]: unknown;
}

export interface SSLCommerzRefundQueryResponse {
  APIConnect?: string;
  status: string;
  refund_ref_id?: string;
  bank_tran_id?: string;
  trans_id?: string;
  refund_amount?: string;
  errorReason?: string;
  [key: string]: unknown;
}

export interface ISSLCommerzClient {
  initiateSession(params: SSLCommerzInitiateSessionParams): Promise<SSLCommerzSessionResponse>;
  validateOrder(valId: string): Promise<SSLCommerzOrderValidationResponse>;
  queryTransaction(tranId: string): Promise<SSLCommerzTransactionQueryResponse>;
  initiateRefund(params: SSLCommerzInitiateRefundParams): Promise<SSLCommerzRefundResponse>;
  queryRefund(refundRefId: string): Promise<SSLCommerzRefundQueryResponse>;
}

export const SSLCOMMERZ_CLIENT = 'SSLCOMMERZ_CLIENT';

export interface SSLCommerzConfig {
  storeId?: string;
  storePassword?: string;
  baseUrl: string;
  timeoutMs?: number;
}

export class SSLCommerzClient implements ISSLCommerzClient {
  private readonly logger = new Logger(SSLCommerzClient.name);
  private readonly storeId: string;
  private readonly storePassword: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: SSLCommerzConfig) {
    this.storeId = config.storeId || '';
    this.storePassword = config.storePassword || '';
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  /**
   * Session Initiation via SSLCommerz v4 API
   * POST /gwprocess/v4/api.php
   */
  async initiateSession(params: SSLCommerzInitiateSessionParams): Promise<SSLCommerzSessionResponse> {
    if (!this.storeId || !this.storePassword) {
      throw new Error(
        'SSLCommerz gateway credentials not configured (SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD required)'
      );
    }

    const endpoint = `${this.baseUrl}/gwprocess/v4/api.php`;

    const formData = new URLSearchParams();
    formData.append('store_id', this.storeId);
    formData.append('store_passwd', this.storePassword);
    formData.append('total_amount', params.total_amount);
    formData.append('currency', params.currency);
    formData.append('tran_id', params.tran_id);
    formData.append('success_url', params.success_url);
    formData.append('fail_url', params.fail_url);
    formData.append('cancel_url', params.cancel_url);
    formData.append('ipn_url', params.ipn_url);
    formData.append('cus_name', params.cus_name);
    formData.append('cus_email', params.cus_email);
    formData.append('cus_add1', 'Dhaka');
    formData.append('cus_city', 'Dhaka');
    formData.append('cus_country', 'Bangladesh');
    formData.append('cus_phone', params.cus_phone || '01700000000');
    formData.append('shipping_method', 'NO');
    formData.append('product_name', params.product_name);
    formData.append('product_category', params.product_category || 'Education');
    formData.append('product_profile', 'non-physical-goods');

    this.logger.log(`Initiating SSLCommerz payment session for tran_id=${params.tran_id} amount=${params.total_amount} ${params.currency}`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz gateway HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as SSLCommerzSessionResponse;
      return data;
    } catch (error) {
      this.logger.error(`SSLCommerz session initiation error for tran_id=${params.tran_id}:`, error);
      throw error;
    }
  }

  /**
   * Authoritative Order Validation API via SSLCommerz v4
   * GET /validator/api/validationserverAPI.php?val_id=...&store_id=...&store_passwd=...&v=1&format=json
   */
  async validateOrder(valId: string): Promise<SSLCommerzOrderValidationResponse> {
    if (!this.storeId || !this.storePassword) {
      throw new Error(
        'SSLCommerz gateway credentials not configured (SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD required)'
      );
    }

    const params = new URLSearchParams({
      val_id: valId,
      store_id: this.storeId,
      store_passwd: this.storePassword,
      v: '1',
      format: 'json',
    });

    const endpoint = `${this.baseUrl}/validator/api/validationserverAPI.php?${params.toString()}`;

    this.logger.log(`Calling SSLCommerz Order Validation API for val_id=${valId}`);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz validation HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as SSLCommerzOrderValidationResponse;
      return data;
    } catch (error) {
      this.logger.error(`SSLCommerz validation API error for val_id=${valId}:`, error);
      throw error;
    }
  }

  /**
   * Authoritative Transaction Query API via SSLCommerz v4
   * GET /validator/api/merchantTransIDvalidationAPI.php?tran_id=...&store_id=...&store_passwd=...&format=json
   */
  async queryTransaction(tranId: string): Promise<SSLCommerzTransactionQueryResponse> {
    if (!this.storeId || !this.storePassword) {
      throw new Error(
        'SSLCommerz gateway credentials not configured (SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD required)'
      );
    }

    const params = new URLSearchParams({
      tran_id: tranId,
      store_id: this.storeId,
      store_passwd: this.storePassword,
      format: 'json',
    });

    const endpoint = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${params.toString()}`;

    this.logger.log(`Calling SSLCommerz Transaction Query API for tran_id=${tranId}`);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz transaction query HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as SSLCommerzTransactionQueryResponse;
      return data;
    } catch (error) {
      this.logger.error(`SSLCommerz transaction query error for tran_id=${tranId}:`, error);
      throw error;
    }
  }

  /**
   * Authoritative Refund Initiation API via SSLCommerz v4
   * GET /validator/api/merchantTransIDvalidationAPI.php?bank_tran_id=...&refund_trans_id=...&refund_amount=...&refund_remarks=...&store_id=...&store_passwd=...&format=json
   */
  async initiateRefund(params: SSLCommerzInitiateRefundParams): Promise<SSLCommerzRefundResponse> {
    if (!this.storeId || !this.storePassword) {
      throw new Error(
        'SSLCommerz gateway credentials not configured (SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD required)'
      );
    }

    const searchParams = new URLSearchParams({
      bank_tran_id: params.bank_tran_id,
      refund_trans_id: params.refund_trans_id,
      refund_amount: params.refund_amount,
      refund_remarks: params.refund_remarks,
      store_id: this.storeId,
      store_passwd: this.storePassword,
      format: 'json',
    });

    if (params.refe_id) {
      searchParams.append('refe_id', params.refe_id);
    }

    const endpoint = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${searchParams.toString()}`;

    this.logger.log(`Calling SSLCommerz Refund Initiation API for refund_trans_id=${params.refund_trans_id}`);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz refund initiation HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as SSLCommerzRefundResponse;
      return data;
    } catch (error) {
      this.logger.error(`SSLCommerz refund initiation error for refund_trans_id=${params.refund_trans_id}:`, error);
      throw error;
    }
  }

  /**
   * Authoritative Refund Status Query API via SSLCommerz v4
   * GET /validator/api/merchantTransIDvalidationAPI.php?refund_ref_id=...&store_id=...&store_passwd=...&format=json
   */
  async queryRefund(refundRefId: string): Promise<SSLCommerzRefundQueryResponse> {
    if (!this.storeId || !this.storePassword) {
      throw new Error(
        'SSLCommerz gateway credentials not configured (SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD required)'
      );
    }

    const searchParams = new URLSearchParams({
      refund_ref_id: refundRefId,
      store_id: this.storeId,
      store_passwd: this.storePassword,
      format: 'json',
    });

    const endpoint = `${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${searchParams.toString()}`;

    this.logger.log(`Calling SSLCommerz Refund Status Query API for refund_ref_id=${refundRefId}`);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`SSLCommerz refund query HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as SSLCommerzRefundQueryResponse;
      return data;
    } catch (error) {
      this.logger.error(`SSLCommerz refund query error for refund_ref_id=${refundRefId}:`, error);
      throw error;
    }
  }
}

/**
 * Deterministic In-Memory Test Double for SSLCommerz
 */
export class MockSSLCommerzClient implements ISSLCommerzClient {
  public sessions = new Map<string, SSLCommerzSessionResponse>();
  public validations = new Map<string, SSLCommerzOrderValidationResponse>();
  public transactionQueries = new Map<string, SSLCommerzTransactionQueryResponse>();
  public refundInitiations = new Map<string, SSLCommerzRefundResponse>();
  public refundQueries = new Map<string, SSLCommerzRefundQueryResponse>();

  public refundInitiationCalls: SSLCommerzInitiateRefundParams[] = [];
  public refundQueryCalls: string[] = [];

  public sessionInitiationHandler?: (
    params: SSLCommerzInitiateSessionParams
  ) => Promise<SSLCommerzSessionResponse>;

  public orderValidationHandler?: (
    valId: string
  ) => Promise<SSLCommerzOrderValidationResponse>;

  public transactionQueryHandler?: (
    tranId: string
  ) => Promise<SSLCommerzTransactionQueryResponse>;

  public refundInitiationHandler?: (
    params: SSLCommerzInitiateRefundParams
  ) => Promise<SSLCommerzRefundResponse>;

  public refundQueryHandler?: (
    refundRefId: string
  ) => Promise<SSLCommerzRefundQueryResponse>;

  async initiateSession(params: SSLCommerzInitiateSessionParams): Promise<SSLCommerzSessionResponse> {
    if (this.sessionInitiationHandler) {
      return this.sessionInitiationHandler(params);
    }

    const sessionKey = `mock_session_${params.tran_id}`;
    const defaultResponse: SSLCommerzSessionResponse = {
      status: 'SUCCESS',
      sessionkey: sessionKey,
      GatewayPageURL: `https://sandbox.sslcommerz.com/EasyCheckout/testpage?sessionkey=${sessionKey}`,
    };

    const response = this.sessions.get(params.tran_id) || defaultResponse;
    return response;
  }

  async validateOrder(valId: string): Promise<SSLCommerzOrderValidationResponse> {
    if (this.orderValidationHandler) {
      return this.orderValidationHandler(valId);
    }

    const response = this.validations.get(valId);
    if (!response) {
      return {
        status: 'INVALID_TRANSACTION',
        tran_id: 'unknown',
        val_id: valId,
        amount: '0.00',
        currency: 'BDT',
        error: 'Transaction not found in mock registry',
      };
    }

    return response;
  }

  async queryTransaction(tranId: string): Promise<SSLCommerzTransactionQueryResponse> {
    if (this.transactionQueryHandler) {
      return this.transactionQueryHandler(tranId);
    }

    const response = this.transactionQueries.get(tranId);
    if (!response) {
      return {
        APIConnect: 'DONE',
        status: 'FAILED',
        element: [],
      };
    }

    return response;
  }

  async initiateRefund(params: SSLCommerzInitiateRefundParams): Promise<SSLCommerzRefundResponse> {
    this.refundInitiationCalls.push(params);
    if (this.refundInitiationHandler) {
      return this.refundInitiationHandler(params);
    }

    const response = this.refundInitiations.get(params.refund_trans_id) || {
      APIConnect: 'DONE',
      status: 'success',
      refund_ref_id: `REF_${params.refund_trans_id}`,
    };

    return response;
  }

  async queryRefund(refundRefId: string): Promise<SSLCommerzRefundQueryResponse> {
    this.refundQueryCalls.push(refundRefId);
    if (this.refundQueryHandler) {
      return this.refundQueryHandler(refundRefId);
    }

    const response = this.refundQueries.get(refundRefId) || {
      APIConnect: 'DONE',
      status: 'refunded',
      refund_ref_id: refundRefId,
    };

    return response;
  }

  /**
   * Helper to configure an authoritative valid payment in the mock
   */
  setMockValidationSuccess(
    valId: string,
    data: {
      tran_id: string;
      amount: string;
      currency?: string;
      bank_tran_id?: string;
      card_type?: string;
      card_brand?: string;
    }
  ) {
    this.validations.set(valId, {
      status: 'VALID',
      val_id: valId,
      tran_id: data.tran_id,
      amount: data.amount,
      currency: data.currency || 'BDT',
      bank_tran_id: data.bank_tran_id || `BANK-${Date.now()}`,
      card_type: data.card_type || 'VISA-City Bank',
      card_brand: data.card_brand || 'VISA',
      tran_date: new Date().toISOString(),
    });
  }

  clear() {
    this.sessions.clear();
    this.validations.clear();
    this.transactionQueries.clear();
    this.refundInitiations.clear();
    this.refundQueries.clear();
    this.refundInitiationCalls = [];
    this.refundQueryCalls = [];
    this.sessionInitiationHandler = undefined;
    this.orderValidationHandler = undefined;
    this.transactionQueryHandler = undefined;
    this.refundInitiationHandler = undefined;
    this.refundQueryHandler = undefined;
  }
}
