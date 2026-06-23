import catalogueJson from '../data/food_catalogue.json' with { type: 'json' }
import type { FoodCatalogueItem } from '../types/foodCatalogue'

export const foodCatalogue = catalogueJson as FoodCatalogueItem[]

const normalise = (value: string) => value.toLowerCase().replace(/[+&]/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

function matchRank(item: FoodCatalogueItem, query: string) {
  const name = normalise(item.name)
  const aliases = (item.aliases ?? []).map(normalise)
  if (name === query) return 0
  if (aliases.includes(query)) return 1
  if (name.startsWith(query)) return 2
  if (aliases.some((alias) => alias.startsWith(query))) return 3
  if (name.includes(query)) return 4
  if (aliases.some((alias) => alias.includes(query))) return 5
  const tokens = query.split(' ').filter(Boolean)
  const searchable = `${name} ${aliases.join(' ')}`
  if (tokens.length && tokens.every((token) => searchable.includes(token))) return 6
  return null
}

export function searchFoodCatalogue(query: string, options: { limit?: number } = {}): FoodCatalogueItem[] {
  const cleanQuery = normalise(query)
  if (cleanQuery.length < 2) return []
  const limit = Math.max(1, options.limit ?? 12)
  return foodCatalogue
    .map((item, index) => ({ item, index, rank: matchRank(item, cleanQuery) }))
    .filter((result): result is { item: FoodCatalogueItem; index: number; rank: number } => result.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item)
}
