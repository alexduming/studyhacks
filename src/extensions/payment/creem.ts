import {
  PaymentProvider,
  PaymentConfigs,
  PaymentOrder,
  PaymentStatus,
  PaymentSession,
  PaymentInterval,
  PaymentCustomField,
  PaymentEvent,
  CheckoutSession,
} from ".";

/**
 * Creem payment provider configs
 * @docs https://docs.creem.io/
 */
export interface CreemConfigs extends PaymentConfigs {
  apiKey: string;
  signingSecret?: string;
  environment?: "sandbox" | "production";
}

/**
 * Creem payment provider implementation
 * @website https://creem.io/
 */
export class CreemProvider implements PaymentProvider {
  readonly name = "creem";
  configs: CreemConfigs;

  private baseUrl: string;

  constructor(configs: CreemConfigs) {
    this.configs = configs;
    this.baseUrl =
      configs.environment === "production"
        ? "https://api.creem.io"
        : "https://test-api.creem.io";
  }

  // create payment
  async createPayment({
    order,
  }: {
    order: PaymentOrder;
  }): Promise<CheckoutSession> {
    try {
      if (!order.productId) {
        throw new Error("productId is required");
      }

      // build payment payload
      const payload: any = {
        product_id: order.productId,
        request_id: order.requestId || undefined,
        units: 1,
        discount_code: order.discount
          ? {
              code: order.discount.code,
            }
          : undefined,
        customer: order.customer
          ? {
              id: order.customer.id,
              email: order.customer.email,
            }
          : undefined,
        custom_fields: order.customFields
          ? order.customFields.map((customField: PaymentCustomField) => ({
              type: customField.type,
              key: customField.name,
              label: customField.label,
              optional: !customField.isRequired as boolean,
              text: customField.metadata,
            }))
          : undefined,
        success_url: order.successUrl,
        metadata: order.metadata,
      };

      const result = await this.makeRequest("/v1/checkouts", "POST", payload);

      // create payment failed
      if (result.error) {
        throw new Error(result.error.message || "create payment failed");
      }

      // create payment success
      return {
        provider: this.name,
        checkoutParams: payload,
        checkoutInfo: {
          sessionId: result.id,
          checkoutUrl: result.checkout_url,
        },
        checkoutResult: result,
        metadata: order.metadata || {},
      };
    } catch (error) {
      throw error;
    }
  }

  // get payment by session id
  // @docs https://docs.creem.io/api-reference/endpoint/get-checkout
  async getPaymentSession({
    sessionId,
  }: {
    sessionId: string;
  }): Promise<PaymentSession> {
    try {
      // retrieve payment
      const session = await this.makeRequest(
        `/v1/checkouts?checkout_id=${sessionId}`,
        "GET"
      );

      if (!session.id || !session.order) {
        throw new Error(session.error || "get payment failed");
      }

      let subscription: any | undefined = undefined;
      let billingUrl = "";

      if (session.subscription) {
        subscription = session.subscription;
      }

      const result: PaymentSession = {
        provider: this.name,
        paymentStatus: this.mapCreemStatus(session),
        paymentInfo: {
          discountCode: "",
          discountAmount: undefined,
          discountCurrency: undefined,
          paymentAmount: session.order.amount_paid || 0,
          paymentCurrency: session.order.currency || "",
          paymentEmail: session.customer?.email || undefined,
          paidAt: session.order.updated_at
            ? new Date(session.order.updated_at)
            : undefined,
        },
        paymentResult: session,
        metadata: session.metadata,
      };

      if (subscription) {
        result.subscriptionId = subscription.id;

        result.subscriptionInfo = {
          subscriptionId: subscription.id,
          productId: session.product?.id,
          planId: "",
          description: session.product?.description || "",
          amount: session.order.amount_paid || 0,
          currency: session.order.currency,
          currentPeriodStart: new Date(subscription.current_period_start_date),
          currentPeriodEnd: new Date(subscription.current_period_end_date),
          interval:
            session.product?.billing_period === "every-month"
              ? PaymentInterval.MONTH
              : subscription.product?.billing_period === "every-year"
                ? PaymentInterval.YEAR
                : subscription.product?.billing_period === "every-week"
                  ? PaymentInterval.WEEK
                  : subscription.product?.billing_period === "every-day"
                    ? PaymentInterval.DAY
                    : undefined,
          intervalCount: 1,
          billingUrl: billingUrl,
        };
        result.subscriptionResult = subscription;
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getPaymentEvent({ req }: { req: Request }): Promise<PaymentEvent> {
    try {
      const rawBody = await req.text();
      const signature = req.headers.get("creem-signature") as string;

      if (!rawBody || !signature) {
        throw new Error("Invalid webhook request");
      }

      if (!this.configs.signingSecret) {
        throw new Error("Signing Secret not configured");
      }

      const computedSignature = await this.generateSignature(
        rawBody,
        this.configs.signingSecret
      );

      if (computedSignature !== signature) {
        throw new Error("Invalid webhook signature");
      }

      // parse the webhook payload
      const event = JSON.parse(rawBody);
      if (!event || !event.eventType) {
        throw new Error("Invalid webhook payload");
      }

      return {
        eventType: event.eventType,
        eventResult: event,
        paymentSession: undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  private async generateSignature(
    payload: string,
    secret: string
  ): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const messageData = encoder.encode(payload);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign("HMAC", key, messageData);

      const signatureArray = new Uint8Array(signature);
      return Array.from(signatureArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (error: any) {
      throw new Error(`Failed to generate signature: ${error.message}`);
    }
  }

  private async makeRequest(endpoint: string, method: string, data?: any) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "x-api-key": this.configs.apiKey,
      "Content-Type": "application/json",
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`request failed with status: ${response.status}`);
    }

    return await response.json();
  }

  private mapCreemStatus(session: any): PaymentStatus {
    const status = session.status;

    switch (status) {
      case "pending":
        return PaymentStatus.PROCESSING;
      case "processing":
        return PaymentStatus.PROCESSING;
      case "completed":
      case "paid":
        return PaymentStatus.SUCCESS;
      case "failed":
        return PaymentStatus.FAILED;
      case "canceled":
      case "expired":
        return PaymentStatus.CANCELED;
      default:
        throw new Error(`Unknown Creem status: ${status}`);
    }
  }
}

/**
 * Create Creem provider with configs
 */
export function createCreemProvider(configs: CreemConfigs): CreemProvider {
  return new CreemProvider(configs);
}
