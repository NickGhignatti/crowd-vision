export interface DomainPayload {
  name: string
  subdomains: string[]
  authStrategy: 'internal' | 'oidc'
}

export interface SSODomainPayload {
  name: string
  subdomains: string[]
  authStrategy: 'internal' | 'oidc'
  ssoConfig?: ISSOConfig
}

export interface ISSOConfig {
  issuerUrl: string
  clientId: string
  clientSecret: string
}

export interface DomainMembership {
  domainName: string
  role: 'owner' | 'admin' | 'viewer'
  externalId?: string
}
