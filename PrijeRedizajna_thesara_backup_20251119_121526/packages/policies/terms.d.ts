export interface TermsPolicy {
  version: string;
  title: string;
  shortLabel: string;
  description?: string;
  url: string;
  fallbackUrl: string;
  embedPath?: string;
}

export declare const TERMS_POLICY: TermsPolicy;
export declare const CURRENT_TERMS_VERSION: string;

declare const _default: {
  TERMS_POLICY: TermsPolicy;
  CURRENT_TERMS_VERSION: string;
};

export default _default;
