import '@tanstack/react-start/server-only'

import { randomUUID } from 'node:crypto'
import { initializeFirestore } from 'firebase-admin/firestore'

import { logger } from '../lib/logger'
import { assertDemoRuntimeEnvironment } from '../lib/demoRuntime'
import { verifyAuthToken } from '../lib/verifyAuthToken'
import { CategorizeItemService } from './catalog'
import { N8nCategorizationProvider } from './catalog/server'
import { SubmitFeedbackService } from './feedback'
import { N8nFeedbackProvider } from './feedback/server'
import {
  GroceryCommandService,
  PersistN8nGroceryService,
  type ListAuthorizationRepository
} from './groceries'
import { createFirebaseAdminGroceryWriteRepository, createFirebaseSdkGroceryRepository } from './groceries/server'
import { AuthenticateUserService } from './identity'
import {
  AuthenticatedUserHandler,
  FirebaseAdminTokenVerifier,
  getFirebaseAdminApp
} from './identity/server'
import {
  N8nMachineAuthenticator,
  type N8nRequestContext
} from './integrations/n8n/server'
import { ChatOpenAI } from '@langchain/openai'
import { RecordClientEventService } from './observability'
import { StructuredClientEventLogger } from './observability/server'
import { GetReleasesService } from './releases'
import { GitHubReleaseRepository } from './releases/server'
import { RecipeCommandService, SuggestRecipesService } from './recipes/server'
import {
  createDeterministicChefGenerator,
  createDeterministicNutritionEstimator,
  createFirebaseAdminListAuthorizationRepository,
  createFirebaseAdminRecipeRepository,
  createJsonTextChefGenerator,
  createJsonTextNutritionEstimator,
  createStructuredModelChefGenerator,
  createStructuredModelNutritionEstimator
} from './recipes/server'
import { recipeNutritionResponseSchema, recipeSuggestionResponseSchema } from './recipes'
import { ReceiptCommandService, ScanReceiptFileService, ScanReceiptUrlService } from './receipts'
import { FirebaseAdminReceiptImageRepository, FirebaseAdminReceiptRepository, N8nReceiptScanner, SafeReceiptUrlFetcher } from './receipts/server'
import { ApplicationError } from './shared'
import {
  createTicketingServer,
  type TicketingServer
} from './ticketing/server'

export type ServerEnvironment = Readonly<{
  FRIDGE_DEMO_MODE?: string
  [key: string]: string | undefined
  FIREBASE_DATABASE_URL?: string
  FIREBASE_PROJECT_ID?: string
  FIREBASE_SERVICE_ACCOUNT_JSON?: string
  GITHUB_RELEASES_TOKEN?: string
  RECEIPT_SCAN_URL?: string
  RECEIPT_URL_SCAN_ENDPOINT?: string
  N8N_ALLOWED_LIST_ID?: string
  N8N_WRITE_SECRET?: string
  OPENAI_API_KEY?: string
  GROQ_API_KEY?: string
  XAI_API_KEY?: string
  PERSONAL_CHEF_PROVIDER?: string
  PERSONAL_CHEF_BASE_URL?: string
  PERSONAL_CHEF_MODEL?: string
}>

export type ServerCompositionOptions = {
  environment: ServerEnvironment
  generateRequestId?: () => string
  now?: () => Date
}

export type N8nGroceryWriteDependencies = {
  authenticateRequest(headers: Pick<Headers, 'get'>): N8nRequestContext
  service: PersistN8nGroceryService
}

const configured = (
  environment: ServerEnvironment,
  key: keyof ServerEnvironment
): string => {
  const value = environment[key]?.trim()
  if (!value) {
    throw new ApplicationError(
      'not_configured',
      `Required server configuration is missing: ${key}`
    )
  }
  return value
}

const firebaseDatabaseUrl = (environment: ServerEnvironment): string => {
  if (environment.FRIDGE_DEMO_MODE === 'true') {
    assertDemoRuntimeEnvironment(environment, process.env)
    return environment.FIREBASE_DATABASE_URL!
  }
  const value = configured(environment, 'FIREBASE_DATABASE_URL')
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new ApplicationError(
      'not_configured',
      'FIREBASE_DATABASE_URL must be a valid URL',
      error
    )
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new ApplicationError(
      'not_configured',
      'FIREBASE_DATABASE_URL must be an HTTPS database root URL'
    )
  }
  return url.toString().replace(/\/$/, '')
}

const firebaseServiceAccountJson = (environment: ServerEnvironment): string => {
  const value = configured(environment, 'FIREBASE_SERVICE_ACCOUNT_JSON')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new ApplicationError(
      'not_configured',
      'FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON',
      error
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ApplicationError(
      'not_configured',
      'FIREBASE_SERVICE_ACCOUNT_JSON must contain a service account object'
    )
  }
  const candidate = parsed as Record<string, unknown>
  if (
    typeof candidate.client_email !== 'string' ||
    !candidate.client_email.trim() ||
    typeof candidate.private_key !== 'string' ||
    !candidate.private_key.includes('PRIVATE KEY')
  ) {
    throw new ApplicationError(
      'not_configured',
      'FIREBASE_SERVICE_ACCOUNT_JSON is missing required service account fields'
    )
  }
  return value
}

/**
 * The sole server dependency-construction boundary.
 *
 * Configuration is validated lazily per capability so an optional integration
 * cannot crash unrelated routes at module load. Instances are cached for warm
 * server runtimes and all clocks/IDs are injected here for deterministic tests.
 */
export class ServerComposition {
  private readonly generateRequestId: () => string
  private readonly now: () => Date
  private authenticationService: AuthenticateUserService | undefined
  private authenticatedUserHandler: AuthenticatedUserHandler | undefined
  private n8nAuthenticator: N8nMachineAuthenticator | undefined
  private n8nGroceryService: PersistN8nGroceryService | undefined
  private n8nGroceryDependencies: N8nGroceryWriteDependencies | undefined
  private groceryCommandService: GroceryCommandService | undefined
  private releasesService: GetReleasesService | undefined
  private recordClientEventService: RecordClientEventService | undefined
  private ticketingServer: TicketingServer | undefined
  private receiptScanner: N8nReceiptScanner | undefined
  private scanReceiptFileService: ScanReceiptFileService | undefined
  private scanReceiptUrlService: ScanReceiptUrlService | undefined
  private receiptCommandService: ReceiptCommandService | undefined
  private categorizeItemService: CategorizeItemService | undefined
  private submitFeedbackService: SubmitFeedbackService | undefined
  private recipeCommandService: RecipeCommandService | undefined
  private suggestRecipesService: SuggestRecipesService | undefined

  constructor(private readonly options: ServerCompositionOptions) {
    if (options.environment.FRIDGE_DEMO_MODE === 'true') {
      assertDemoRuntimeEnvironment(options.environment, process.env)
    }
    this.generateRequestId = options.generateRequestId ?? randomUUID
    this.now = options.now ?? (() => new Date())
  }

  getAuthenticationService(): AuthenticateUserService {
    if (!this.authenticationService) {
      const app = getFirebaseAdminApp(this.options.environment)
      this.authenticationService = new AuthenticateUserService(
        new FirebaseAdminTokenVerifier(app),
        this.options.environment.NODE_ENV === 'development' &&
        this.options.environment.VITE_DEV_AUTH_BYPASS === 'true'
          ? { email: this.options.environment.VITE_DEV_AUTH_EMAIL || 'dev@example.com' }
          : null
      )
    }
    return this.authenticationService
  }

  getAuthenticatedUserHandler(): AuthenticatedUserHandler {
    this.authenticatedUserHandler ??= new AuthenticatedUserHandler({
      authenticationService: this.getAuthenticationService(),
      generateRequestId: this.generateRequestId,
      now: this.now
    })
    return this.authenticatedUserHandler
  }

  private getN8nAuthenticator(): N8nMachineAuthenticator {
    this.n8nAuthenticator ??= new N8nMachineAuthenticator(
      {
        sharedSecret: configured(this.options.environment, 'N8N_WRITE_SECRET'),
        allowedListId: configured(
          this.options.environment,
          'N8N_ALLOWED_LIST_ID'
        )
      },
      this.generateRequestId
    )
    return this.n8nAuthenticator
  }

  getN8nGroceryWriteService(): PersistN8nGroceryService {
    this.n8nGroceryService ??= new PersistN8nGroceryService(
      createFirebaseAdminGroceryWriteRepository({
        FIREBASE_DATABASE_URL: firebaseDatabaseUrl(this.options.environment),
        FIREBASE_SERVICE_ACCOUNT_JSON: firebaseServiceAccountJson(
          this.options.environment
        )
      })
    )
    return this.n8nGroceryService
  }

  getN8nGroceryWriteDependencies(): N8nGroceryWriteDependencies {
    const authenticator = this.getN8nAuthenticator()
    this.n8nGroceryDependencies ??= {
      authenticateRequest: (headers) =>
        authenticator.authenticateRequest(headers, this.now()),
      service: this.getN8nGroceryWriteService()
    }
    return this.n8nGroceryDependencies
  }

  getGroceryCommandService(): GroceryCommandService {
    if (!this.groceryCommandService) {
      const app = getFirebaseAdminApp(this.options.environment)
      const databaseUrl = firebaseDatabaseUrl(this.options.environment)
      this.groceryCommandService = new GroceryCommandService(
        createFirebaseSdkGroceryRepository(app, databaseUrl),
        createFirebaseAdminListAuthorizationRepository(app, databaseUrl)
      )
    }
    return this.groceryCommandService
  }

  getReleasesService(): GetReleasesService {
    this.releasesService ??= new GetReleasesService(
      new GitHubReleaseRepository(this.options.environment.GITHUB_RELEASES_TOKEN)
    )
    return this.releasesService
  }

  getRecordClientEventService(): RecordClientEventService {
    this.recordClientEventService ??= new RecordClientEventService(
      new StructuredClientEventLogger(logger)
    )
    return this.recordClientEventService
  }

  getTicketingServer(): TicketingServer {
    this.ticketingServer ??= createTicketingServer({
      // Keep the explicit environment object live for serverless/test runtimes
      // that intentionally update deployment flags between invocations.
      environment: this.options.environment as NodeJS.ProcessEnv,
      authenticate: verifyAuthToken,
      createRunId: this.generateRequestId,
      now: () => this.now().getTime(),
      logger
    })
    return this.ticketingServer
  }

  getCategorizeItemService(): CategorizeItemService {
    this.categorizeItemService ??= new CategorizeItemService(
      new N8nCategorizationProvider(this.options.environment.CATEGORIZE_ITEM_WEBHOOK_URL)
    )
    return this.categorizeItemService
  }

  getSubmitFeedbackService(): SubmitFeedbackService {
    this.submitFeedbackService ??= new SubmitFeedbackService(
      new N8nFeedbackProvider(this.options.environment.FEEDBACK_WEBHOOK_URL)
    )
    return this.submitFeedbackService
  }

  private getReceiptScanner(): N8nReceiptScanner {
    this.receiptScanner ??= new N8nReceiptScanner(
      this.options.environment.RECEIPT_SCAN_URL,
      this.options.environment.RECEIPT_URL_SCAN_ENDPOINT
    )
    return this.receiptScanner
  }

  getScanReceiptFileService(): ScanReceiptFileService {
    this.scanReceiptFileService ??= new ScanReceiptFileService(this.getReceiptScanner())
    return this.scanReceiptFileService
  }

  getScanReceiptUrlService(): ScanReceiptUrlService {
    this.scanReceiptUrlService ??= new ScanReceiptUrlService(new SafeReceiptUrlFetcher(), this.getReceiptScanner())
    return this.scanReceiptUrlService
  }

  getReceiptCommandService(): ReceiptCommandService {
    if (!this.receiptCommandService) {
      const authorization: ListAuthorizationRepository = {
        assertAccessible: async () => {
          throw new ApplicationError('not_configured', 'List authorization repository is not configured')
        }
      }
      const app = getFirebaseAdminApp({
        FIREBASE_PROJECT_ID: this.options.environment.FIREBASE_PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_JSON: this.options.environment.FIREBASE_SERVICE_ACCOUNT_JSON
      })
      this.receiptCommandService = new ReceiptCommandService(
        new FirebaseAdminReceiptRepository(
          firebaseDatabaseUrl(this.options.environment),
          app.options.credential!
        ),
        new FirebaseAdminReceiptImageRepository(
          initializeFirestore(app, { preferRest: true })
        ),
        authorization
      )
    }
    return this.receiptCommandService
  }

  private getRecipeFirebaseApp() {
    return getFirebaseAdminApp(this.options.environment)
  }

  getRecipeCommandService(): RecipeCommandService {
    if (!this.recipeCommandService) {
      const app = this.getRecipeFirebaseApp()
      const databaseUrl = firebaseDatabaseUrl(this.options.environment)
      this.recipeCommandService = new RecipeCommandService(
        createFirebaseAdminRecipeRepository(app, databaseUrl),
        createFirebaseAdminListAuthorizationRepository(app, databaseUrl)
      )
    }
    return this.recipeCommandService
  }

  getSuggestRecipesService(): SuggestRecipesService {
    if (!this.suggestRecipesService) {
      const app = this.getRecipeFirebaseApp()
      const databaseUrl = firebaseDatabaseUrl(this.options.environment)
      const recipeRepository = createFirebaseAdminRecipeRepository(app, databaseUrl)
      const provider = this.options.environment.PERSONAL_CHEF_PROVIDER || 'openai'
      const groqApiKey = this.options.environment.GROQ_API_KEY?.trim()
      const xaiApiKey = this.options.environment.XAI_API_KEY?.trim()
      const openAiApiKey = this.options.environment.OPENAI_API_KEY?.trim()
      const apiKey =
        provider === 'groq'
          ? groqApiKey
          : provider === 'xai'
            ? xaiApiKey
            : openAiApiKey
      const model =
        this.options.environment.PERSONAL_CHEF_MODEL ||
        (provider === 'groq'
          ? 'qwen/qwen3.8-27b'
          : provider === 'xai'
            ? 'grok-4.7'
            : 'gpt-5.4-mini')
      const configuration =
        provider === 'groq'
          ? { baseURL: this.options.environment.PERSONAL_CHEF_BASE_URL || 'https://api.groq.com/openai/v1' }
          : provider === 'xai'
            ? { baseURL: this.options.environment.PERSONAL_CHEF_BASE_URL || 'https://api.x.ai/v1' }
            : undefined
      const chatModel = apiKey
        ? new ChatOpenAI({
            model,
            apiKey,
            configuration,
            temperature: 0.2,
            maxRetries: 0,
            timeout: 25_000
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
        : this.options.environment.FRIDGE_DEMO_MODE === 'true'
          ? createDeterministicChefGenerator()
          : { invoke: async () => { throw new ApplicationError('unavailable', 'Recipe provider is not configured') } }
      const nutritionEstimator = chatModel && this.options.environment.PERSONAL_CHEF_NUTRITION_ENABLED === 'true'
        ? provider === 'groq'
          ? createJsonTextNutritionEstimator(chatModel)
          : createStructuredModelNutritionEstimator(
              chatModel.withStructuredOutput(recipeNutritionResponseSchema, {
                name: 'personal_chef_recipe_nutrition',
                strict: true
              })
            )
        : createDeterministicNutritionEstimator()

      this.suggestRecipesService = new SuggestRecipesService(
        recipeRepository,
        createFirebaseAdminListAuthorizationRepository(app, databaseUrl),
        generator,
        this.generateRequestId,
        nutritionEstimator
      )
    }
    return this.suggestRecipesService
  }
}

let defaultComposition: ServerComposition | undefined

export const getServerComposition = (): ServerComposition => {
  defaultComposition ??= new ServerComposition({ environment: process.env })
  return defaultComposition
}

// Compatibility getters keep routes thin while construction remains centralized.
export const getAuthenticationService = (): AuthenticateUserService =>
  getServerComposition().getAuthenticationService()

export const getAuthenticatedUserHandler = (): AuthenticatedUserHandler =>
  getServerComposition().getAuthenticatedUserHandler()

export const getN8nGroceryWriteDependencies = (): N8nGroceryWriteDependencies =>
  getServerComposition().getN8nGroceryWriteDependencies()

export const getGroceryCommandService = (): GroceryCommandService =>
  getServerComposition().getGroceryCommandService()

export const getReleasesService = (): GetReleasesService =>
  getServerComposition().getReleasesService()

export const getRecordClientEventService = (): RecordClientEventService =>
  getServerComposition().getRecordClientEventService()

export const getTicketingServer = (): TicketingServer =>
  getServerComposition().getTicketingServer()

export const getScanReceiptFileService = (): ScanReceiptFileService =>
  getServerComposition().getScanReceiptFileService()

export const getScanReceiptUrlService = (): ScanReceiptUrlService =>
  getServerComposition().getScanReceiptUrlService()

export const getReceiptCommandService = (): ReceiptCommandService =>
  getServerComposition().getReceiptCommandService()

export const getCategorizeItemService = (): CategorizeItemService =>
  getServerComposition().getCategorizeItemService()

export const getSubmitFeedbackService = (): SubmitFeedbackService =>
  getServerComposition().getSubmitFeedbackService()

export const getRecipeCommandService = (): RecipeCommandService =>
  getServerComposition().getRecipeCommandService()

export const getSuggestRecipesService = (): SuggestRecipesService =>
  getServerComposition().getSuggestRecipesService()
