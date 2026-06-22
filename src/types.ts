export type MealSection = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export interface FoodItem {
  name: string
  calories: number
}

export interface FoodLogEntry extends FoodItem {
  id: string
  meal: MealSection
  createdAt: string
}

export interface DayLog {
  date: string
  entries: FoodLogEntry[]
}

export interface FavouriteFood extends FoodItem {
  id: string
  defaultMeal: MealSection
  createdAt: string
}

export interface RecentFood extends FoodItem {
  id: string
  meal: MealSection
  lastUsedAt: string
}

export interface AppData {
  version: 2
  days: Record<string, DayLog>
  favourites: FavouriteFood[]
  recentFoods: RecentFood[]
}
