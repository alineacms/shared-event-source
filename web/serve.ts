import {serve} from 'bun'
import index from './index.html'

const connectedClients = new Set<ReadableStreamDefaultController<string>>()

serve({
  port: 3000,
  routes: {
    '/': index
  },
  idleTimeout: 0,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/sse') {
      if (request.method === 'GET') {
        const stream = new ReadableStream({
          start(controller) {
            connectedClients.add(controller)

            request.signal.addEventListener('abort', () => {
              connectedClients.delete(controller)
            })

            controller.enqueue('data: Connected\n\n')
          }
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          }
        })
      } else if (request.method === 'POST') {
        const body = JSON.parse(await request.text())
        for (const controller of connectedClients) {
          if (body === 'close') {
            try {
              controller.close()
            } finally {
              connectedClients.delete(controller)
            }
          } else {
            controller.enqueue(`data: ${JSON.stringify(body)}\n\n`)
          }
        }
        return new Response('Event sent', {status: 200})
      }
    }
    return new Response('Not Found', {status: 404})
  }
})
