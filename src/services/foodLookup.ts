export interface FoodEstimate {
  name: string
  brand?: string
  calories: number
  quantity?: number
  unitCalories?: number
  source: 'local' | 'open-food-facts' | 'combo' | 'alias' | 'partial' | 'manual'
  note?: string
  matchedTerms?: string[]
}

export type FoodLookupErrorCode = 'network' | 'missing-calories'

export class FoodLookupError extends Error {
  code: FoodLookupErrorCode

  constructor(code: FoodLookupErrorCode) {
    super(code)
    this.code = code
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
    toast: 90, 'bread slice': 90, 'slice of bread': 90, butter: 50, jam: 70,
    'buttered toast': 150, 'jam toast': 160, 'peanut butter toast': 250,
  },
  meals: {
    sandwich: 400, 'chicken sandwich': 450, 'cheese sandwich': 400, 'ham sandwich': 380,
    wrap: 450, 'chicken wrap': 450, salad: 250, 'caesar salad': 450, soup: 250,
    'chicken soup': 300, pasta: 600, rice: 250, curry: 700, 'pizza slice': 280, pizza: 900,
    burger: 650, fries: 350, chips: 350, omelette: 300, 'chicken breast': 280, egg: 75,
    'boiled egg': 75, 'scrambled eggs': 220, 'cheese on toast': 350,
    'cheese toastie': 450, 'toasted cheese sandwich': 450, 'ham and cheese sandwich': 450,
    'tuna mayo sandwich': 450, 'beans on toast': 400, 'egg on toast': 220,
    'avocado toast': 300, 'chicken and rice': 550, 'chicken rice': 550,
    'pasta with sauce': 600, 'pasta and sauce': 600, 'crepe with nutella': 260,
    'pancake with syrup': 300, 'yoghurt with berries': 220, 'ready meal': 600,
  },
  snacks: {
    crisps: 180, 'chocolate bar': 230, chocolate: 230, biscuit: 70, biscuits: 140,
    cookie: 160, 'cake slice': 350, muffin: 400, nuts: 180, cheese: 120, cheddar: 120,
    ham: 70, chicken: 180, tuna: 120, mayonnaise: 90, mayo: 90, sugar: 20,
    nutella: 100, 'peanut butter': 180, beans: 180, 'baked beans': 180, popcorn: 150,
  },
  drinks: {
    coffee: 40, milk: 30, 'oat milk': 45, 'coffee with milk': 40, 'coffee with oat milk': 60,
    latte: 150, cappuccino: 120, tea: 30, 'tea with milk': 30, 'orange juice': 110,
    juice: 110, wine: 160, beer: 180,
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
  'red wine': 'wine',
  'toast with jam': 'jam toast',
}

const CANONICAL_FOOD_ALIASES: Record<string, string> = {
  'toast with cheese': 'cheese on toast',
  'cheesy toast': 'cheese on toast',
  'cheese toast': 'cheese on toast',
  'melted cheese on toast': 'cheese on toast',
}

const COMMON_TYPOS: Record<string, string> = {
  cheries: 'cherry',
  creap: 'crepe',
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
  bananas: 'banana',
  coffees: 'coffee',
  toasties: 'toastie',
}

const SINGULAR_WORDS: Record<string, string> = {
  cherries: 'cherry', strawberries: 'strawberry', blueberries: 'blueberry', raspberries: 'raspberry',
  tomatoes: 'tomato', potatoes: 'potato', crepes: 'crepe', pancakes: 'pancake', biscuits: 'biscuit',
  eggs: 'egg', sandwiches: 'sandwich', bananas: 'banana', coffees: 'coffee', toasties: 'toastie',
}

const COMBO_PHRASES = new Set([
  'ham and cheese sandwich', 'beans on toast', 'egg on toast', 'chicken and rice',
  'pasta with sauce', 'pasta and sauce', 'crepe with nutella', 'pancake with syrup',
  'yoghurt with berries', 'coffee with oat milk', 'coffee with milk', 'tea with milk',
])

const PORTION_NOTES: Record<string, string> = {
  'cheese on toast': 'Assuming one fairly normal cheese-on-toast situation. The cheese may have other ideas.',
  cherry: 'Assuming a small bowl-ish serving.',
  cherries: 'Assuming a small bowl-ish serving.',
  crepe: 'Assuming one plain-ish crepe before toppings start causing trouble.',
  grapes: 'Assuming a small bunch.',
  pasta: 'Assuming a normal plate, not a theatrical mountain.',
  wine: 'Assuming a normal glass. Optimistic, perhaps.',
}

const normalise = (value: string) => value.toLowerCase().replace(/[+&]/g, ' and ').trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

const QUANTITY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 }

function extractQuantity(value: string) {
  const numericMultiplier = value.match(/^([1-4])\s*(?:x|\*)\s+(.+)$/)
  if (numericMultiplier) {
    return { quantity: Number(numericMultiplier[1]), food: numericMultiplier[2].trim(), explicit: true }
  }

  const numericPortions = value.match(/^([1-4])\s+(.+)$/)
  if (numericPortions) {
    return { quantity: Number(numericPortions[1]), food: numericPortions[2].trim(), explicit: true }
  }

  const wordedPortions = value.match(/^(one|two|three|four)(?:\s+(?:lots?|portions?)\s+of)?\s+(.+)$/)
  if (wordedPortions) {
    return { quantity: QUANTITY_WORDS[wordedPortions[1]], food: wordedPortions[2].trim(), explicit: true }
  }

  return { quantity: 1, food: value, explicit: false }
}

function createLocalEstimate(query: string, key: string, quantity: number, source: FoodEstimate['source'] = 'local', note?: string, matchedTerms?: string[]): FoodEstimate {
  const unitCalories = LOCAL_ESTIMATES[key]
  return {
    name: query.trim(),
    calories: unitCalories * quantity,
    quantity,
    unitCalories,
    source,
    note: note ?? PORTION_NOTES[key],
    matchedTerms: matchedTerms ?? [key],
  }
}

const singularisePhrase = (value: string) => value.split(' ').map((word) => SINGULAR_WORDS[word] ?? word).join(' ')
const knownKeys = () => Object.keys(LOCAL_ESTIMATES).sort((a, b) => b.length - a.length)
const comboTerms = (value: string) => value.split(/\b(?:with|and|on|in|plus)\b/).map((part) => part.trim()).filter(Boolean)

function resolvePart(value: string): { key: string; source: FoodEstimate['source']; partial: boolean } | null {
  if (LOCAL_ESTIMATES[value]) return { key: value, source: 'local', partial: false }
  const alias = FOOD_ALIASES[value]
  if (alias && LOCAL_ESTIMATES[alias]) return { key: alias, source: 'alias', partial: false }
  const singular = SINGULAR_FORMS[value] ?? singularisePhrase(value)
  if (LOCAL_ESTIMATES[singular]) return { key: singular, source: 'alias', partial: false }
  const contained = knownKeys().find((key) => value.includes(key))
  return contained ? { key: contained, source: 'partial', partial: true } : null
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = saved
    }
  }
  return row[b.length]
}

function closestSingleFood(value: string) {
  if (value.includes(' ') || value.length < 4) return null
  const ranked = knownKeys().filter((key) => !key.includes(' ')).map((term) => ({ term, key: SINGULAR_WORDS[term] ?? term, distance: editDistance(value, term) })).sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  if (!best || (best.distance > 1 && !(value.length >= 5 && best.distance <= 2))) return null
  if (ranked[1]?.distance === best.distance && ranked[1].key !== best.key) return null
  return best.key
}

export async function estimateFoodByName(query: string): Promise<FoodEstimate | null> {
  const normalised = normalise(query)
  if (!normalised) return null
  const { quantity, food, explicit } = extractQuantity(normalised)
  if (!food) return null
  const lookupPhrase = explicit ? singularisePhrase(food) : food

  const exact = LOCAL_ESTIMATES[lookupPhrase]
  if (exact) {
    const isCombo = COMBO_PHRASES.has(lookupPhrase)
    return createLocalEstimate(query, lookupPhrase, quantity, isCombo ? 'combo' : 'local', isCombo ? 'This is snack algebra, not a court statement.' : undefined, isCombo ? comboTerms(lookupPhrase) : undefined)
  }

  const canonical = CANONICAL_FOOD_ALIASES[lookupPhrase]
  if (canonical && LOCAL_ESTIMATES[canonical]) {
    return createLocalEstimate(query, canonical, quantity, 'alias')
  }

  const alias = FOOD_ALIASES[lookupPhrase]
  if (alias && LOCAL_ESTIMATES[alias]) return createLocalEstimate(query, alias, quantity, 'alias')

  const singular = SINGULAR_FORMS[lookupPhrase]
  if (singular && LOCAL_ESTIMATES[singular]) return createLocalEstimate(query, singular, quantity, 'alias')

  const containedPhrase = knownKeys().filter((key) => key.includes(' ')).find((key) => lookupPhrase.includes(key))
  if (containedPhrase) {
    const terms = comboTerms(containedPhrase)
    const extra = lookupPhrase.replace(containedPhrase, '').trim()
    const note = extra
      ? `I understood the ${terms.join(' and ')}. The ${extra} bit remains legally separate.`
      : undefined
    return createLocalEstimate(query, containedPhrase, quantity, 'partial', note, terms)
  }

  const parts = comboTerms(lookupPhrase)
  if (parts.length > 1) {
    const resolved = parts.map(resolvePart)
    const known = resolved.filter((part): part is NonNullable<typeof part> => Boolean(part))
    if (known.length) {
      const unitCalories = known.reduce((sum, part) => sum + LOCAL_ESTIMATES[part.key], 0)
      const unknown = parts.filter((_, index) => !resolved[index])
      return {
        name: query.trim(), calories: unitCalories * quantity, quantity, unitCalories, source: 'combo',
        matchedTerms: known.map((part) => part.key),
        note: unknown.length
          ? 'One ingredient escaped the paperwork, but the rest has been counted.'
          : 'This is snack algebra, not a court statement.',
      }
    }
  }

  const partial = knownKeys().find((knownFood) => lookupPhrase.includes(knownFood) || (lookupPhrase.length >= 4 && knownFood.includes(lookupPhrase)))
  if (partial) return createLocalEstimate(query, partial, quantity, 'partial', PORTION_NOTES[partial] ?? `Using ${partial} maths. Close enough for notebook work.`)

  const typo = COMMON_TYPOS[lookupPhrase]
  if (typo) return createLocalEstimate(query, typo, quantity, 'alias', `I think you meant ${typo}. If not, the snack oracle apologises.`)

  const fuzzy = closestSingleFood(lookupPhrase)
  return fuzzy ? createLocalEstimate(query, fuzzy, quantity, 'alias', `I think you meant ${fuzzy}. If not, the snack oracle apologises.`) : null
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
