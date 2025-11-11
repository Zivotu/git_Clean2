export interface BillingPackage {
  id: string;
  name: string;
  description?: string;
  features?: string[];
  tier?: string;
  priceId: string;
  price?: number;
  currency?: string;
  billingPeriod?: string;
}

