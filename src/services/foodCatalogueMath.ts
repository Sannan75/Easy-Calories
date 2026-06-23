import type { CatalogueServingOption, FoodCatalogueItem } from '../types/foodCatalogue'

export const caloriesForCatalogueWeight = (kcalPer100g: number, grams: number) => Math.round(kcalPer100g * grams / 100)

export function caloriesForFixedServing(item: FoodCatalogueItem, serving?: CatalogueServingOption) {
  const calories = serving?.kcal ?? item.kcalFixed
  return typeof calories === 'number' && Number.isFinite(calories) && calories > 0 ? Math.round(calories) : null
}
