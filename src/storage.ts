import type { AppData } from './types'

const STORAGE_KEY = 'easy-calories-data-v1'

export const emptyData = (): AppData => ({ version: 1, days: {}, favourites: [] })

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    if (parsed.version !== 1 || !parsed.days || !Array.isArray(parsed.favourites)) return emptyData()
    return parsed as AppData
  } catch {
    return emptyData()
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function isValidImport(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<AppData>
  return data.version === 1 && Boolean(data.days) && typeof data.days === 'object' && Array.isArray(data.favourites)
}
