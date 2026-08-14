export type VerifiedUser = {
  uid: string
  email: string | null
  emailVerified: boolean
}

export interface UserTokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedUser>
}
