import { register } from 'node:module'

// NODE_OPTIONS also loads this registration in the Studio server's child processes.
register('./raw-markdown-loader.mjs', import.meta.url)
