import assert from 'node:assert/strict'
import test from 'node:test'

import { estimateFoodByName } from '../src/services/foodLookup.ts'

const cases = [
  ['cheese on toast', 350, 1],
  ['toast with cheese', 350, 1],
  ['cheesy toast', 350, 1],
  ['cheese toast', 350, 1],
  ['melted cheese on toast', 350, 1],
  ['2 x toast with cheese', 700, 2],
  ['two cheese on toast', 700, 2],
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
