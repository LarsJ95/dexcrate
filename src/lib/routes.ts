export const ROUTES = ['overview', 'collection', 'scan', 'sets', 'wishlist', 'transactions', 'photos', 'import', 'backup', 'settings', 'more'] as const
export type Route = (typeof ROUTES)[number]
