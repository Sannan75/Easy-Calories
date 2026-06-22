export interface FoodEstimate {
  name: string
  brand?: string
  calories: number
  quantity?: number
  unitCalories?: number
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

const LOCAL_FOOD_GROUPS: Record<string, Record<string, number>> = {
  fruit: {
    banana: 105, apple: 95, orange: 65, pear: 100, grapes: 70, cherries: 90, cherry: 90,
    strawberries: 50, strawberry: 50, blueberries: 85, blueberry: 85, raspberries: 65,
    raspberry: 65, mango: 200, pineapple: 80, watermelon: 45, kiwi: 45, peach: 60, plum: 30,
  },
  breakfast: {
    porridge: 220, oats: 220, cereal: 180, granola: 250, yoghurt: 150, yogurt: 150,
    croissant: 230, pancake: 175, pancakes: 350, crepe: 160, crepes: 320, waffle: 220,
    toast: 90, 'buttered toast': 150, 'jam toast': 160, 'peanut butter toast': 250,
  },
  meals: {
    sandwich: 400, 'chicken sandwich': 450, 'cheese sandwich': 400, 'ham sandwich': 380,
    wrap: 450, 'chicken wrap': 450, salad: 250, 'caesar salad': 450, soup: 250,
    'chicken soup': 300, pasta: 600, rice: 250, curry: 700, 'pizza slice': 280, pizza: 900,
    burger: 650, fries: 350, chips: 350, omelette: 300, 'chicken breast': 280, egg: 75,
    'boiled egg': 75, 'scrambled eggs': 220, 'cheese toastie': 450, 'ready meal': 600,
  },
  snacks: {
    crisps: 180, 'chocolate bar': 230, chocolate: 230, biscuit: 70, biscuits: 140,
    cookie: 160, 'cake slice': 350, muffin: 400, nuts: 180, cheese: 120, popcorn: 150,
  },
  drinks: {
    coffee: 40, 'coffee with milk': 40, latte: 150, cappuccino: 120, tea: 30,
    'tea with milk': 30, 'orange juice': 110, juice: 110, wine: 160, beer: 180,
  },
}

const LOCAL_ESTIMATES: Record<string, number> = Object.assign({}, ...Object.values(LOCAL_FOOD_GROUPS))

const FOOD_ALIASES: Record<string, string> = {
  cherries: 'cherry',
  crepes: 'crepe',
  yoghurt: 'yogurt',
  'choc bar': 'chocolate bar',
  cuppa: 'tea with milk',
  brew: 'tea with milk',
}

const SINGULAR_FORMS: Record<string, string> = {
  cherries: 'cherry',
  strawberries: 'strawberry',
  blueberries: 'blueberry',
  raspberries: 'raspberry',
  tomatoes: 'tomato',
  potatoes: 'potato',
  crepes: 'crepe',
  pancakes: 'pancake',
  biscuits: 'biscuit',
  eggs: 'egg',
  sandwiches: 'sandwich',
}

const PORTION_NOTES: Record<string, string> = {
  cherry: 'Assuming a small bowl-ish serving.',
  cherries: 'Assuming a small bowl-ish serving.',
  crepe: 'Assuming one plain-ish crepe before toppings start causing trouble.',
  grapes: 'Assuming a small bunch.',
  pasta: 'Assuming a normal plate, not a theatrical mountain.',
  wine: 'Assuming a normal glass. Optimistic, perhaps.',
}

const normalise = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')

const QUANTITY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 }

function extractQuantity(value: string) {
  const match = value.match(/^(one|two|three|four|[1-4])\b\s*(?:x\b\s*)?/)
  if (!match) return { quantity: 1, food: value, explicit: false }
  return {
    quantity: QUANTITY_WORDS[match[1]] ?? Number(match[1]),
    food: value.slice(match[0].length).trim(),
    explicit: true,
  }
}

function createLocalEstimate(query: string, key: string, quantity: number, partial = false): FoodEstimate {
  const unitCalories = LOCAL_ESTIMATES[key]
  return {
    name: query.trim(),
    calories: unitCalories * quantity,
    quantity,
    unitCalories,
    source: 'local',
    note: PORTION_NOTES[key] ?? (partial ? `Using ${key} maths. Close enough for notebook work.` : undefined),
  }
}

export async function estimateFoodByName(query: string): Promise<FoodEstimate | null> {
  const normalised = normalise(query)
  if (!normalised) return null
  const { quantity, food, explicit } = extractQuantity(normalised)
  if (!food) return null

  // Explicit counts describe individual items, so "two crepes" uses the one-crepe entry.
  if (explicit) {
    const unitKey = FOOD_ALIASES[food] ?? SINGULAR_FORMS[food]
    if (unitKey && LOCAL_ESTIMATES[unitKey]) return createLocalEstimate(query, unitKey, quantity)
  }

  const exact = LOCAL_ESTIMATES[food]
  if (exact) return createLocalEstimate(query, food, quantity)

  const alias = FOOD_ALIASES[food]
  if (alias && LOCAL_ESTIMATES[alias]) return createLocalEstimate(query, alias, quantity)

  const singular = SINGULAR_FORMS[food]
  if (singular && LOCAL_ESTIMATES[singular]) return createLocalEstimate(query, singular, quantity)

  const partial = Object.keys(LOCAL_ESTIMATES)
    .sort((a, b) => b.length - a.length)
    .find((knownFood) => food.includes(knownFood) || (food.length >= 4 && knownFood.includes(food)))

  return partial
    ? createLocalEstimate(query, partial, quantity, true)
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
        quantity: 1,
        unitCalories: Math.round(perServing),
        source: 'open-food-facts',
        note: product.serving_size ? `Using the listed serving of ${product.serving_size}.` : 'Using the listed serving calories.',
      }
    }

    if (per100g && servingQuantity) {
      return {
        name,
        brand: product.brands?.trim() || undefined,
        calories: Math.round(per100g * servingQuantity / 100),
        quantity: 1,
        unitCalories: Math.round(per100g * servingQuantity / 100),
        source: 'open-food-facts',
        note: `Roughly calculated for ${product.serving_size || `${servingQuantity}g`}.`,
      }
    }

    if (per100g) {
      return {
        name,
        brand: product.brands?.trim() || undefined,
        calories: Math.round(per100g),
        quantity: 1,
        unitCalories: Math.round(per100g),
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
