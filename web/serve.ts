import {serve} from 'bun'
import {handler} from './handler'
import index from './index.html'

serve({
  port: 3000,
  routes: {
    '/': index
  },
  idleTimeout: 0,
  async fetch(request) {
    const response = await handler(request)
    if (typeof response === 'boolean')
      throw new Error('No handler for root path')
    return response
  }
})
