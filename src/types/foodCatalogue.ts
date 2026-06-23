export type ServingType = 'weight' | 'fixed'

export interface CatalogueServingOption {
  label: string
  grams?: number | null
  kcal?: number | null
  note?: string
}

export interface FoodCatalogueItem {
  id: number
  name: string
  aliases?: string[]
  group?: string
  servingType: ServingType
  kcalPer100g?: number
  kcalFixed?: number
  servings: CatalogueServingOption[]
  note?: string
}
