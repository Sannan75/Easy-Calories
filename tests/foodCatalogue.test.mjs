import assert from 'node:assert/strict'
import test from 'node:test'

import catalogueJson from '../src/data/food_catalogue.json' with { type: 'json' }
import { caloriesForCatalogueWeight, caloriesForFixedServing } from '../src/services/foodCatalogueMath.ts'
import { searchFoodCatalogue } from '../src/services/foodCatalogueSearch.ts'
import { validateFoodCatalogue } from '../src/services/foodCatalogueValidation.ts'

test('the supplied catalogue passes structural and serving validation', () => {
  assert.equal(catalogueJson.length, 259)
  assert.deepEqual(validateFoodCatalogue(catalogueJson), [])
  assert.equal(new Set(catalogueJson.map((item) => item.id)).size, catalogueJson.length)
  assert.ok(catalogueJson.every((item) => item.servings.length > 0))
  assert.ok(catalogueJson.filter((item) => item.servingType === 'weight').every((item) => item.kcalPer100g > 0))
  assert.ok(catalogueJson.filter((item) => item.servingType === 'fixed').every((item) => item.kcalFixed > 0 || item.servings.some((serving) => serving.kcal > 0)))
})

test('catalogue validation reports duplicate ids and unsafe calorie data', () => {
  const invalid = [
    { id: 1, name: 'Fine thing', servingType: 'fixed', kcalFixed: 100, servings: [{ label: 'One', kcal: 100 }] },
    { id: 1, name: 'Broken thing', servingType: 'weight', kcalPer100g: 0, servings: [{ label: '', grams: -2 }] },
  ]
  const errors = validateFoodCatalogue(invalid)
  assert.ok(errors.some((error) => error.includes('duplicate id')))
  assert.ok(errors.some((error) => error.includes('kcalPer100g')))
  assert.ok(errors.some((error) => error.includes('label is required')))
  assert.ok(errors.some((error) => error.includes('grams must be positive')))
})

test('catalogue search finds useful food choices', () => {
  const chicken = searchFoodCatalogue('chick')
  assert.match(chicken[0]?.name ?? '', /Chicken breast/i)
  assert.ok(chicken.some((item) => /Chicken thigh/i.test(item.name)))

  assert.equal(searchFoodCatalogue('full eng')[0]?.name, 'Full English breakfast')

  const corn = searchFoodCatalogue('corn').map((item) => item.name)
  assert.ok(corn.includes('Cornflakes'))
  assert.ok(corn.includes('Cornflakes with milk'))

  assert.equal(searchFoodCatalogue('rice')[0]?.name, 'Rice, cooked')
})

test('exact, starts-with and alias matches outrank weak contains matches', () => {
  assert.equal(searchFoodCatalogue('cornflakes')[0]?.name, 'Cornflakes')
  assert.equal(searchFoodCatalogue('breast')[0]?.name, 'Chicken breast, cooked, skinless')
  assert.equal(searchFoodCatalogue('fry up')[0]?.name, 'Full English breakfast')
})

test('catalogue amount maths rounds weight and fixed portions', () => {
  assert.equal(caloriesForCatalogueWeight(165, 100), 165)
  assert.equal(caloriesForCatalogueWeight(165, 125), 206)
  assert.equal(caloriesForCatalogueWeight(165, 62.5), 103)

  const fishPie = catalogueJson.find((item) => item.name === 'Fish pie')
  const normal = fishPie?.servings.find((serving) => serving.label === 'Normal serving')
  assert.ok(fishPie)
  assert.equal(caloriesForFixedServing(fishPie, normal), 500)
})
