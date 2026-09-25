import { z } from 'zod'

export const recipeMealTypeSchema = z.enum([
  'quick_dinner',
  'full_dinner',
  'breakfast',
  'lunch',
  'snack',
  'meal_prep',
  'other'
])

export const MAX_RECIPE_PRODUCTS = 300

export const recipeProductSchema = z.object({
  groceryKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  quantity: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional()
})

export const recipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().min(1).max(80).nullable(),
  fromSelectedProducts: z.boolean(),
  pantryBasic: z.boolean()
})

export const recipeImageSchema = z.object({
  url: z.string().url().nullable(),
  sourceUrl: z.string().url().nullable().optional(),
  sourceName: z.string().trim().min(1).max(120).nullable().optional(),
  alt: z.string().trim().min(1).max(160)
})

export const recipeSourceSchema = z.object({
  kind: z.literal('personal_chef'),
  graphRunId: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(100).optional()
})

export const recipeCandidateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(800),
  servings: z.number().int().min(1).max(20),
  mealType: recipeMealTypeSchema,
  estimatedTimeMinutes: z.number().int().min(1).max(24 * 60).nullable(),
  selectedProducts: z.array(recipeProductSchema).min(1).max(MAX_RECIPE_PRODUCTS),
  assumedBasics: z.array(z.string().trim().min(1).max(80)).max(20),
  ingredients: z.array(recipeIngredientSchema).min(1).max(80),
  steps: z.array(z.string().trim().min(1).max(800)).min(1).max(30),
  image: recipeImageSchema,
  chefNotes: z.string().trim().min(1).max(800).nullable().optional(),
  source: recipeSourceSchema
})

export const recipeRecordSchema = recipeCandidateSchema.omit({ id: true }).extend({
  key: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime(),
  createdBy: z.string().trim().min(1).max(320).nullable(),
  listId: z.string().trim().min(1).max(200)
})

export const saveRecipeInputSchema = z.object({
  listId: z.string().trim().min(1).max(200),
  recipe: recipeCandidateSchema
})

export const suggestRecipesInputSchema = z.object({
  listId: z.string().trim().min(1).max(200),
  servings: z.number().int().min(1).max(20),
  mealType: recipeMealTypeSchema,
  preferences: z.string().trim().max(1_000).optional(),
  products: z.array(recipeProductSchema).min(1).max(MAX_RECIPE_PRODUCTS),
  language: z.enum(['he', 'en']).optional()
})

export const recipeSuggestionResponseSchema = z.object({
  recipes: z.array(recipeCandidateSchema).min(1).max(5),
  warnings: z.array(z.string().trim().min(1).max(300)).max(10).default([])
})

export type RecipeMealType = z.infer<typeof recipeMealTypeSchema>
export type RecipeProductInput = z.infer<typeof recipeProductSchema>
export type RecipeCandidateInput = z.infer<typeof recipeCandidateSchema>
export type RecipeRecordInput = z.infer<typeof recipeRecordSchema>
export type SaveRecipeInput = z.infer<typeof saveRecipeInputSchema>
export type SuggestRecipesInput = z.infer<typeof suggestRecipesInputSchema>
export type RecipeSuggestionResponse = z.infer<typeof recipeSuggestionResponseSchema>
