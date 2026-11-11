export type RouteEntry = {
  module: string
  page: string
  params?: Record<string, string>
}

export type RouteManifest = {
  version: 4
  base: string
  liveReload: boolean
  revision: number
  redirects: Record<string, string>
  routes: Record<string, RouteEntry>
  notFound: RouteEntry | undefined
}

export type HmrUpdate = {
  path: string
  url: string
  type: 'css' | 'refresh'
}

export type HmrChange = {
  revision: number
  reload: boolean
  routes: boolean
  timestamp: number
  updates: HmrUpdate[]
}
