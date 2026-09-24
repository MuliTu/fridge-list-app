export type VerifiedUser = {
  uid: string
  email: string | null
  emailVerified: boolean
}

export type UserTokenVerifier = {
  verifyIdToken(token: string): Promise<VerifiedUser>
}
