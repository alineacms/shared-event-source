import {serve} from 'bun'
import dashboard from './dashboard.html'

const clients = new Set()

serve({
  port: 3000,
  routes: {
    '/': dashboard
  },
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/sse') {
      if (request.method === 'GET') {
        const stream = new ReadableStream({
          start(controller) {
            const client = {controller}
            clients.add(client)

            request.signal.addEventListener('abort', () => {
              clients.delete(client)
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
        for (const client of clients) {
          ;(client as any).controller.enqueue(
            `data: ${JSON.stringify(body)}\n\n`
          )
        }
        return new Response('Event sent', {status: 200})
      }
    }

    return new Response('Not Found', {status: 404})
  }
})
