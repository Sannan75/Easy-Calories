import assert from 'node:assert/strict'
import test from 'node:test'

import { barcodePackSizeGrams, barcodeProductDisplayName, caloriesForGrams, estimateFoodByName, lookupFoodByBarcode, parseGramAmount } from '../src/services/foodLookup.ts'

const cases = [
  ['cheese on toast', 350, 1],
  ['toast with cheese', 350, 1],
  ['cheesy toast', 350, 1],
  ['cheese toast', 350, 1],
  ['melted cheese on toast', 350, 1],
  ['2x cheese on toast', 700, 2],
  ['2 x cheese on toast', 700, 2],
  ['2* cheese on toast', 700, 2],
  ['2 cheese on toast', 700, 2],
  ['2 x toast with cheese', 700, 2],
  ['two cheese on toast', 700, 2],
  ['two lots of cheese on toast', 700, 2],
  ['two portions of cheese on toast', 700, 2],
]

for (const [phrase, calories, quantity] of cases) {
  test(`${phrase} resolves to the canonical cheese-on-toast estimate`, async () => {
    const estimate = await estimateFoodByName(phrase)
    assert.ok(estimate)
    assert.equal(estimate.calories, calories)
    assert.equal(estimate.quantity, quantity)
    assert.equal(estimate.unitCalories, 350)
    assert.deepEqual(estimate.matchedTerms, ['cheese on toast'])
    assert.equal(
      estimate.note,
      'Assuming one fairly normal cheese-on-toast situation. The cheese may have other ideas.',
    )
  })
}

test('unrelated known combinations retain their own estimates', async () => {
  const expected = new Map([
    ['chicken and rice', 550],
    ['yoghurt with berries', 220],
    ['coffee with oat milk', 60],
    ['toast with jam', 160],
  ])

  for (const [phrase, calories] of expected) {
    const estimate = await estimateFoodByName(phrase)
    assert.equal(estimate?.calories, calories, phrase)
  }
})

test('leading quantities multiply ordinary foods after base estimation', async () => {
  const bananas = await estimateFoodByName('3 bananas')
  assert.equal(bananas?.unitCalories, 105)
  assert.equal(bananas?.quantity, 3)
  assert.equal(bananas?.calories, 315)

  const compactBananas = await estimateFoodByName('2x banana')
  assert.equal(compactBananas?.unitCalories, 105)
  assert.equal(compactBananas?.quantity, 2)
  assert.equal(compactBananas?.calories, 210)
})

test('product names and trailing measurements are not treated as quantities', async () => {
  const wine = await estimateFoodByName('red wine 750ml')
  assert.equal(wine?.quantity, 1)
  assert.equal(wine?.calories, 160)

  const sevenUp = await estimateFoodByName('7up')
  assert.equal(sevenUp, null)

  const fiveAlive = await estimateFoodByName('5 alive juice')
  assert.equal(fiveAlive?.quantity, 1)
  assert.equal(fiveAlive?.calories, 110)
})

test('barcode product identity uses stable priority with barcode as last resort', () => {
  assert.equal(barcodeProductDisplayName({ product_name: 'Fish Pie', generic_name: 'Pie', brands: 'Seaside' }, '12345678'), 'Fish Pie')
  assert.equal(barcodeProductDisplayName({ generic_name: 'Fish Pie', brands: 'Seaside' }, '12345678'), 'Fish Pie')
  assert.equal(barcodeProductDisplayName({ abbreviated_product_name: 'Masala Peanuts', brands: 'Snack Co' }, '12345678'), 'Masala Peanuts')
  assert.equal(barcodeProductDisplayName({ brands: 'Seaside' }, '12345678'), 'Seaside')
  assert.equal(barcodeProductDisplayName({ product_name: '12345678', generic_name: '---', brands: '98765' }, '12345678'), '')
  assert.equal(barcodeProductDisplayName({}, '12345678'), '')
})

test('nutrition-only barcode lookup succeeds with an intentionally blank display name', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 1,
      product: {
        product_name: '5063089309292',
        generic_name: '---',
        brands: '12345',
        serving_quantity: 100,
        serving_size: '100g',
        nutriments: { 'energy-kcal_100g': 250 },
      },
    }),
  })

  try {
    const estimate = await lookupFoodByBarcode('5063089309292')
    assert.ok(estimate)
    assert.equal(estimate.name, '')
    assert.equal(estimate.calories, 250)
    assert.equal(estimate.barcode, '5063089309292')
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('per-100g calorie maths supports packs and fractional gram amounts', () => {
  assert.equal(caloriesForGrams(528, 100), 528)
  assert.equal(caloriesForGrams(528, 125), 660)
  assert.equal(caloriesForGrams(528, 62.5), 330)
  assert.equal(caloriesForGrams(484, 400), 1936)
})

test('gram-labelled pack sizes are parsed conservatively', () => {
  assert.equal(parseGramAmount('125g'), 125)
  assert.equal(parseGramAmount('400 g'), 400)
  assert.equal(parseGramAmount('1 portion (400 g)'), 400)
  assert.equal(barcodePackSizeGrams({ quantity: '125g' }), 125)
  assert.equal(barcodePackSizeGrams({ product_quantity: 125, product_quantity_unit: 'g' }), 125)
  assert.equal(barcodePackSizeGrams({ product_quantity: 125 }), null)
  assert.equal(barcodePackSizeGrams({}), null)
})

test('per-100g lookup defaults to a known pack size and exposes amount metadata', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 1,
      product: {
        product_name: 'Masala Peanuts',
        quantity: '125g',
        nutriments: { 'energy-kcal_100g': 528 },
      },
    }),
  })

  try {
    const estimate = await lookupFoodByBarcode('5060231726907')
    assert.ok(estimate)
    assert.equal(estimate.name, 'Masala Peanuts')
    assert.equal(estimate.calculationMode, 'per100g')
    assert.equal(estimate.kcalPer100g, 528)
    assert.equal(estimate.packSizeGrams, 125)
    assert.equal(estimate.grams, 125)
    assert.equal(estimate.calories, 660)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})
