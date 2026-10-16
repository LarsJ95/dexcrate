export const ROUTES = ['overview', 'collection', 'scan', 'sets', 'locations', 'wishlist', 'transactions', 'photos', 'crate', 'import', 'backup', 'settings', 'more'] as const
export type Route = (typeof ROUTES)[number]
