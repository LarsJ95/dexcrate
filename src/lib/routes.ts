export const ROUTES = ['overview', 'collection', 'scan', 'sets', 'wishlist', 'transactions', 'photos', 'import', 'settings', 'more'] as const
export type Route = (typeof ROUTES)[number]
