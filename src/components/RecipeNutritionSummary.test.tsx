import { render, screen } from '@testing-library/react'
import { RecipeNutritionSummary } from './RecipeNutritionSummary'
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

it('hides legacy unsupported numbers and makes the unknown state explicit', () => {
  render(<RecipeNutritionSummary nutrition={{ calories: 777, proteinGrams: 10, fatGrams: 5 }} />)
  expect(screen.getByText('nutrition.unavailable')).toBeTruthy()
  expect(screen.queryByText('777')).toBeNull()
})

it('labels values with their approximate model basis', () => {
  render(<RecipeNutritionSummary nutrition={{ calories: 300, proteinGrams: 10, fatGrams: 5, estimateSource: 'model', estimateBasis: 'selected-weights-per-serving' }} />)
  expect(screen.getByText('nutrition.modelEstimate')).toBeTruthy()
  expect(screen.queryByText('nutrition.unavailable')).toBeNull()
})
