import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkArchitecture } from './check-architecture.mjs'

const withProject = async (files, run) => {
  const root = await mkdtemp(path.join(tmpdir(), 'fridge-architecture-'))
  try {
    await Promise.all(
      Object.entries(files).map(async ([relative, source]) => {
        const target = path.join(root, relative)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, source)
      })
    )
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts documented dependency directions through public entry points', async () => {
  await withProject(
    {
      'src/modules/orders/application/placeOrder.ts': "import type { Clock } from '../../shared'\n",
      'src/modules/shared/index.ts': "export type { Clock } from './application/clock'\n",
      'src/modules/shared/application/clock.ts': 'export interface Clock { now(): Date }\n',
      'src/modules/orders/server.ts': "import '@tanstack/react-start/server-only'\n",
      'src/routes/api/orders.tsx': "import { createOrderRepository } from '../../modules/orders/server'\n"
    },
    async (root) => {
      assert.deepEqual((await checkArchitecture(root)).violations, [])
    }
  )
})

test('accepts cross-module imports through server public sub-entries', async () => {
  await withProject(
    {
      'src/modules/orders/server.ts': "import { db } from '../shared/server/prisma'\n",
      'src/modules/shared/server/prisma.ts':
        "import '@tanstack/react-start/server-only'\nimport { db } from '../infrastructure/db.server'\nexport { db }\n",
      'src/modules/shared/infrastructure/db.server.ts': 'export const db = {}\n'
    },
    async (root) => {
      assert.deepEqual((await checkArchitecture(root)).violations, [])
    }
  )
})

test('reports provider/framework imports from application code with a file and line', async () => {
  await withProject(
    {
      'src/modules/orders/application/placeOrder.ts':
        "const value = true\nimport { initializeApp } from 'firebase/app'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /^src\/modules\/orders\/application\/placeOrder\.ts:2/)
      assert.match(violations[0], /\[core-provider-framework\]/)
    }
  )
})

test('rejects deep cross-module imports', async () => {
  await withProject(
    {
      'src/modules/orders/application/placeOrder.ts':
        "import { Clock } from '../../shared/application/clock'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /\[module-public-api\]/)
      assert.match(violations[0], /src\/modules\/shared or src\/modules\/shared\/server/)
    }
  )
})

test('rejects client imports of server entry points', async () => {
  await withProject(
    {
      'src/components/OrderButton.tsx':
        "import { createOrderRepository } from '../modules/orders/server'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /\[client-server-boundary\]/)
    }
  )
})

test('rejects client imports of server public sub-entries', async () => {
  await withProject(
    {
      'src/components/OrderButton.tsx':
        "import { db } from '../modules/shared/server/prisma'\n",
      'src/modules/shared/server/prisma.ts': "import '@tanstack/react-start/server-only'\nexport const db = {}\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /\[client-server-boundary\]/)
    }
  )
})

test('rejects direct server-only package imports from client-capable code', async () => {
  await withProject(
    {
      'src/components/OrderButton.tsx':
        "import { getAuth } from 'firebase-admin/auth'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /^src\/components\/OrderButton\.tsx:1/)
      assert.match(violations[0], /\[client-server-package\]/)
    }
  )
})

test('rejects Node built-ins from client-capable code', async () => {
  await withProject(
    {
      'src/components/OrderButton.tsx':
        "import { randomUUID } from 'node:crypto'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /\[client-server-package\]/)
    }
  )
})

test('rejects generated Prisma imports from client-capable code', async () => {
  await withProject(
    {
      'src/components/OrderButton.tsx':
        "import { PrismaClient } from '../generated/prisma/client'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /^src\/components\/OrderButton\.tsx:1/)
      assert.match(violations[0], /\[client-server-package\]/)
    }
  )
})

test('ignores generated source output', async () => {
  await withProject(
    {
      'src/generated/prisma/client.ts': "import process from 'node:process'\n"
    },
    async (root) => {
      assert.deepEqual((await checkArchitecture(root)).violations, [])
    }
  )
})

test('rejects Prisma imports from routes', async () => {
  await withProject(
    {
      'src/routes/api/orders.tsx':
        "import { PrismaClient } from '../../generated/prisma/client'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /^src\/routes\/api\/orders\.tsx:1/)
      assert.match(violations[0], /\[route-provider-sdk\]/)
    }
  )
})

test('allows generated Prisma imports from server infrastructure', async () => {
  await withProject(
    {
      'src/modules/shared/infrastructure/prismaClient.server.ts':
        "import { PrismaClient } from '../../../generated/prisma/client'\n"
    },
    async (root) => {
      assert.deepEqual((await checkArchitecture(root)).violations, [])
    }
  )
})

test('rejects provider SDK imports from routes', async () => {
  await withProject(
    {
      'src/routes/api/order.tsx':
        "import { Firestore } from '@google-cloud/firestore'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /^src\/routes\/api\/order\.tsx:1/)
      assert.match(violations[0], /\[route-provider-sdk\]/)
    }
  )
})

test('rejects orchestration and network provider imports from routes', async () => {
  await withProject(
    {
      'src/routes/api/order.tsx':
        "import { ChatOpenAI } from '@langchain/openai'\nimport { lookup } from 'node:dns/promises'\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 2)
      assert.match(violations[0], /\[route-provider-sdk\]/)
      assert.match(violations[1], /\[route-provider-sdk\]/)
    }
  )
})

test('rejects environment reads from application services', async () => {
  await withProject(
    {
      'src/modules/orders/application/placeOrder.ts':
        "const providerName = process.env.ORDER_PROVIDER\n"
    },
    async (root) => {
      const { violations } = await checkArchitecture(root)
      assert.equal(violations.length, 1)
      assert.match(violations[0], /^src\/modules\/orders\/application\/placeOrder\.ts:1/)
      assert.match(violations[0], /\[application-environment\]/)
    }
  )
})
