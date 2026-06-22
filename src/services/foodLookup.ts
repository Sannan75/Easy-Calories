export interface FoodEstimate {
  name: string
  brand?: string
  calories: number
  source: 'local' | 'open-food-facts'
  note?: string
}

export type FoodLookupErrorCode = 'network' | 'missing-calories'

export class FoodLookupError extends Error {
  constructor(public code: FoodLookupErrorCode) {
    super(code)
    this.name = 'FoodLookupError'
  }
}

const LOCAL_ESTIMATES: Record<string, number> = {
  banana: 105,
  apple: 95,
  coffee: 40,
  'coffee with milk': 40,
  'tea with milk': 30,
  toast: 90,
  'buttered toast': 150,
  'cheese toastie': 450,
  porridge: 220,
  oats: 220,
  soup: 250,
  'chicken soup': 300,
  sandwich: 400,
  'chicken sandwich': 450,
  'chicken wrap': 450,
  salad: 250,
  'caesar salad': 450,
  pasta: 600,
  rice: 250,
  'chicken breast': 280,
  egg: 75,
  'boiled egg': 75,
  crisps: 180,
  'chocolate bar': 230,
  yoghurt: 150,
  'pizza slice': 280,
  'ready meal': 600,
}

const normalise = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')

export async function estimateFoodByName(query: string): Promise<FoodEstimate | null> {
  const normalised = normalise(query)
  if (!normalised) return null

  const exact = LOCAL_ESTIMATES[normalised]
  if (exact) return { name: query.trim(), calories: exact, source: 'local' }

  const partial = Object.keys(LOCAL_ESTIMATES)
    .sort((a, b) => b.length - a.length)
    .find((food) => normalised.includes(food) || (normalised.length >= 4 && food.includes(normalised)))

  return partial
    ? { name: query.trim(), calories: LOCAL_ESTIMATES[partial], source: 'local', note: `Using ${partial} maths. Close enough for notebook work.` }
    : null
}

type OpenFoodFactsProduct = {
  product_name?: string
  generic_name?: string
  brands?: string
  serving_quantity?: number | string
  serving_size?: string
  nutriments?: Record<string, number | string | undefined>
}

type OpenFoodFactsResponse = {
  status?: number
  product?: OpenFoodFactsProduct
}

const asPositiveNumber = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export async function lookupFoodByBarcode(barcode: string): Promise<FoodEstimate | null> {
  const cleanBarcode = barcode.replace(/\s+/g, '')
  if (!/^\d{8,14}$/.test(cleanBarcode)) return null

  const fields = 'product_name,generic_name,brands,serving_quantity,serving_size,nutriments'
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 9000)

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanBarcode)}?fields=${fields}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new FoodLookupError('network')
    const data = await response.json() as OpenFoodFactsResponse
    if (data.status !== 1 || !data.product) return null

    const product = data.product
    const nutriments = product.nutriments ?? {}
    const perServing = asPositiveNumber(nutriments['energy-kcal_serving'])
    const per100g = asPositiveNumber(nutriments['energy-kcal_100g']) ?? asPositiveNumber(nutriments['energy-kcal'])
    const servingQuantity = asPositiveNumber(product.serving_quantity)
    const name = product.product_name?.trim() || product.generic_name?.trim() || 'Mysterious packaged food'

    if (perServing) {
      return {
        name,
        brand: product.brands?.trim() || undefined,
        calories: Math.round(perServing),
        source: 'open-food-facts',
        note: product.serving_size ? `Using the listed serving of ${product.serving_size}.` : 'Using the listed serving calories.',
      }
    }

    if (per100g && servingQuantity) {
      return {
        name,
        brand: product.brands?.trim() || undefined,
        calories: Math.round(per100g * servingQuantity / 100),
        source: 'open-food-facts',
        note: `Roughly calculated for ${product.serving_size || `${servingQuantity}g`}.`,
      }
    }

    if (per100g) {
      return {
        name,
        brand: product.brands?.trim() || undefined,
        calories: Math.round(per100g),
        source: 'open-food-facts',
        note: 'Found it, but the serving size is being coy. Using per-100g calories.',
      }
    }

    throw new FoodLookupError('missing-calories')
  } catch (error) {
    if (error instanceof FoodLookupError) throw error
    throw new FoodLookupError('network')
  } finally {
    window.clearTimeout(timeout)
  }
}
