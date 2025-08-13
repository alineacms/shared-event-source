import {serve} from 'bun'
import {handler} from './handler'
import index from './index.html'

serve({
  port: 3000,
  routes: {
    '/': index
  },
  idleTimeout: 0,
  fetch: handler
})
