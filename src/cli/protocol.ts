export type RouteEntry = {
  module: string
  page: string
}

export type RouteManifest = {
  version: 2
  liveReload: boolean
  revision: number
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
