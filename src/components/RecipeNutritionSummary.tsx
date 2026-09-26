import { useTranslation } from 'react-i18next'

import type { RecipeNutrition } from '../types'

type RecipeNutritionSummaryProps = {
  nutrition?: RecipeNutrition | null
}

const formatValue = (
  value: number | null | undefined,
  unit: string
) => value == null ? null : `${Math.round(value)}${unit}`

export function RecipeNutritionSummary({ nutrition }: RecipeNutritionSummaryProps) {
  const { t } = useTranslation('recipes')
  const values = [
    {
      key: 'calories',
      label: t('nutrition.calories'),
      value: nutrition?.calories == null
        ? null
        : t('nutrition.kcalValue', { count: Math.round(nutrition.calories) })
    },
    {
      key: 'protein',
      label: t('nutrition.protein'),
      value: formatValue(nutrition?.proteinGrams, t('nutrition.gramsSuffix'))
    },
    {
      key: 'fat',
      label: t('nutrition.fat'),
      value: formatValue(nutrition?.fatGrams, t('nutrition.gramsSuffix'))
    },
    {
      key: 'carbs',
      label: t('nutrition.carbs'),
      value: formatValue(nutrition?.carbsGrams, t('nutrition.gramsSuffix'))
    }
  ]

  const visibleValues = values.filter((item) => item.value)
  if (visibleValues.length === 0) return null

  return (
    <section className="recipe-nutrition" aria-label={t('nutrition.title')}>
      <h4>{t('nutrition.title')}</h4>
      <div className="recipe-nutrition-grid">
        {visibleValues.map((item) => (
          <span key={item.key}>
            <strong>{item.value}</strong>
            {item.label}
          </span>
        ))}
      </div>
      <p>{t('nutrition.perServing')}</p>
    </section>
  )
}
