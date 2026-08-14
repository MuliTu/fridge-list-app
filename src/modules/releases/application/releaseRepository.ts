export type Release = {
  tag_name: string
  name: string
  published_at: string
  body: string
}

export interface ReleaseRepository {
  getReleases(): Promise<readonly Release[]>
}
