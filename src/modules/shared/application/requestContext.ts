export type UserPrincipal = {
  kind: 'user'
  uid: string
  email: string | null
  emailVerified: boolean
}

export type ServicePrincipal = {
  kind: 'service'
  service: string
  scopes: readonly string[]
}

export type AuthenticatedPrincipal = UserPrincipal | ServicePrincipal

export type RequestContext = {
  principal: AuthenticatedPrincipal
  requestId: string
  now: Date
}
