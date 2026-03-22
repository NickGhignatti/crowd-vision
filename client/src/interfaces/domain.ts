import type { SSODomain } from '@/models/domain.ts'

export interface SubdomainItem {
  name: string
  displayName: string
}

export interface UnifiedDomainGroup {
  name: string
  role: string
  canUpload: boolean
  subdomains: SubdomainItem[]
}

export interface DomainToAddWithMaster extends SSODomain {
  masterDomain?: string
}

export interface DomainToAddWithVisibilityPayload extends DomainToAddWithMaster {
  isVisibleFromOutside: boolean
}

export interface DomainSubscriptionRowProps {
  id: number,
  name: string,
  isSubscribed: boolean,
}
