/** Start currently loads .env.local independently of Vite's envDir setting. */
export const isolateStartPlugins = (plugins) => {
  const flattened = plugins.flat(Infinity)
  const isolated = flattened.filter((plugin) => plugin?.name !== 'tanstack-start-core:load-env')
  if (isolated.length === flattened.length) throw new Error('Start env loader changed; demo isolation must be reviewed.')
  return isolated
}

export const demoRequestPolicy = (requestUrl) => {
  let path
  try {
    path = new URL(requestUrl, 'http://127.0.0.1:5173').pathname
    for (let pass = 0; pass < 3 && path.includes('%'); pass++) path = decodeURIComponent(path)
    if (path.includes('%')) return false
    path = new URL(path.replaceAll('\\', '/').replace(/\/+/g, '/'), 'http://127.0.0.1:5173').pathname
  } catch {
    return false
  }
  if (!path.toLowerCase().startsWith('/api')) return true
  // Only isolated recipe and grocery commands are enabled.
  return path === '/api/recipes' || path === '/api/personal-chef/suggest-recipes' ||
    /^\/api\/lists\/[^/]+\/groceries(?:\/[^/]+(?:\/purchased)?)?$/.test(path)
}

export const demoSafetyPlugin = () => ({
  name: 'fridge-isolated-demo-safety',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      response.setHeader('Content-Security-Policy',
        "connect-src 'self' http://127.0.0.1:9000 ws://127.0.0.1:9000 http://127.0.0.1:9099 http://127.0.0.1:8080 ws://127.0.0.1:5173; img-src 'self' data: blob:; frame-src 'self' http://127.0.0.1:9099")
      if (!demoRequestPolicy(request.url || '/')) {
        response.statusCode = 503
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ success: false, error: 'This integration is disabled in the isolated demo.' }))
        return
      }
      next()
    })
  }
})
