import type { AppData } from './types'
import { dedupeFavourites } from './utils/foodKey'

const STORAGE_KEY = 'easy-calories-data-v1'

export const emptyData = (): AppData => ({ version: 2, days: {}, favourites: [], recentFoods: [] })

export function normaliseData(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as { version?: number; days?: unknown; favourites?: unknown; recentFoods?: unknown }
  if (!data.days || typeof data.days !== 'object' || !Array.isArray(data.favourites)) return null
  if (data.version === 1) {
    return { version: 2, days: data.days as AppData['days'], favourites: dedupeFavourites(data.favourites as AppData['favourites']), recentFoods: [] }
  }
  if (data.version === 2 && Array.isArray(data.recentFoods)) return { ...(data as AppData), favourites: dedupeFavourites(data.favourites as AppData['favourites']) }
  return null
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    return normaliseData(JSON.parse(raw)) ?? emptyData()
  } catch {
    return emptyData()
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, favourites: dedupeFavourites(data.favourites) }))
}
