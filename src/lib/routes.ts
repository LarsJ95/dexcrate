export const ROUTES = ['overview', 'collection', 'scan', 'sets', 'wishlist', 'transactions', 'photos', 'crate', 'import', 'backup', 'settings', 'admin', 'more'] as const
export type Route = (typeof ROUTES)[number]
