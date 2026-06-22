import type { FavouriteFood } from '../types'

export function normaliseFoodName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function dedupeFavourites(favourites: FavouriteFood[]) {
  const seen = new Set<string>()
  return [...favourites]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((food) => {
      const key = normaliseFoodName(food.name)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
