import { hasWishlist } from '../lib/wishlist'
import { useDbFeature } from './useDbFeature'

/** True als STAP6 (doelen + wishlist) in de database staat; undefined zolang dat gecontroleerd wordt. */
export function useWishlistEnabled(): boolean | undefined {
  return useDbFeature(hasWishlist, 'wishlist')
}
