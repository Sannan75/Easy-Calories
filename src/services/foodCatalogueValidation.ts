import type { FoodCatalogueItem } from '../types/foodCatalogue'

const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0

export function validateFoodCatalogue(value: unknown): string[] {
  if (!Array.isArray(value)) return ['Catalogue must be an array.']
  const errors: string[] = []
  const ids = new Set<number>()

  value.forEach((raw, index) => {
    const item = raw as Partial<FoodCatalogueItem>
    const label = item.name?.trim() || `Item ${index + 1}`
    if (!positive(item.id)) errors.push(`${label}: id must be a positive number.`)
    else if (ids.has(item.id!)) errors.push(`${label}: duplicate id ${item.id}.`)
    else ids.add(item.id!)
    if (!item.name?.trim()) errors.push(`Item ${index + 1}: name is required.`)
    if (item.servingType !== 'weight' && item.servingType !== 'fixed') errors.push(`${label}: invalid servingType.`)
    if (!Array.isArray(item.servings) || item.servings.length === 0) errors.push(`${label}: at least one serving is required.`)

    if (item.servingType === 'weight' && !positive(item.kcalPer100g)) errors.push(`${label}: kcalPer100g must be positive.`)
    if (item.servingType === 'fixed') {
      const hasFixedCalories = positive(item.kcalFixed) || item.servings?.some((serving) => positive(serving.kcal))
      if (!hasFixedCalories) errors.push(`${label}: fixed items need positive calories.`)
    }

    item.servings?.forEach((serving, servingIndex) => {
      const servingLabel = `${label}, serving ${servingIndex + 1}`
      if (!serving.label?.trim()) errors.push(`${servingLabel}: label is required.`)
      if (item.servingType === 'weight' && serving.grams !== null && !positive(serving.grams)) errors.push(`${servingLabel}: grams must be positive or null.`)
      if (item.servingType === 'fixed' && serving.kcal != null && !positive(serving.kcal)) errors.push(`${servingLabel}: kcal must be positive.`)
    })
  })

  return errors
}
