export interface Domain {
  name: string
  subdomains: string[]
  authStrategy: 'internal' | 'oidc'
}

export interface SSODomain {
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
  role: string
  externalId?: string
}
