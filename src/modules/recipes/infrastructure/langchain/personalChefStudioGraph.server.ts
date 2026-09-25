import '@tanstack/react-start/server-only'

import { ChatOpenAI } from '@langchain/openai'

import { recipeSuggestionResponseSchema } from '../../domain/recipeSchemas'
import {
  createCompiledPersonalChefGraph,
  createDeterministicChefGenerator,
  createJsonTextChefGenerator,
  createStructuredModelChefGenerator
} from './personalChefGraph'

const provider = process.env.PERSONAL_CHEF_PROVIDER || 'openai'
const groqApiKey = process.env.GROQ_API_KEY?.trim()
const xaiApiKey = process.env.XAI_API_KEY?.trim()
const openAiApiKey = process.env.OPENAI_API_KEY?.trim()
const apiKey =
  provider === 'groq'
    ? groqApiKey
    : provider === 'xai'
      ? xaiApiKey
      : openAiApiKey
const model =
  process.env.PERSONAL_CHEF_MODEL ||
  (provider === 'groq'
    ? 'qwen/qwen3.8-27b'
    : provider === 'xai'
      ? 'grok-4.7'
      : 'gpt-5.4-mini')
const configuration =
  provider === 'groq'
    ? { baseURL: process.env.PERSONAL_CHEF_BASE_URL || 'https://api.groq.com/openai/v1' }
    : provider === 'xai'
      ? { baseURL: process.env.PERSONAL_CHEF_BASE_URL || 'https://api.x.ai/v1' }
      : undefined

const chatModel = apiKey
  ? new ChatOpenAI({
      model,
      apiKey,
      configuration,
      temperature: 0.2
    })
  : null

const generator = chatModel
  ? provider === 'groq'
    ? createJsonTextChefGenerator(chatModel)
    : createStructuredModelChefGenerator(
        chatModel.withStructuredOutput(recipeSuggestionResponseSchema, {
          name: 'personal_chef_recipe_suggestions',
          strict: true
        })
      )
  : createDeterministicChefGenerator()

/**
 * LangGraph Studio entry point.
 *
 * Invoke with the initial graph state:
 * {
 *   "runId": "local-chef-test-1",
 *   "request": {
 *     "listId": "local-list",
 *     "servings": 2,
 *     "mealType": "quick_dinner",
 *     "preferences": "no oven",
 *     "language": "en",
 *     "products": [
 *       { "groceryKey": "-eggs", "name": "eggs", "category": "Dairy", "quantity": 6, "unit": "pcs" },
 *       { "groceryKey": "-tomato", "name": "tomatoes", "category": "Vegetables", "quantity": 4, "unit": "pcs" }
 *     ]
 *   }
 * }
 */
export const graph = createCompiledPersonalChefGraph(generator)
