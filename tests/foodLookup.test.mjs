import assert from 'node:assert/strict'
import test from 'node:test'

import { estimateFoodByName } from '../src/services/foodLookup.ts'

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
