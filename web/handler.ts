const connectedClients = new Set<{
  controller: ReadableStreamDefaultController<string>
}>()

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/sse') {
    if (request.method === 'GET') {
      const stream = new ReadableStream({
        start(controller) {
          const client = {controller}
          connectedClients.add(client)

          request.signal.addEventListener('abort', () => {
            connectedClients.delete(client)
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
      for (const client of connectedClients) {
        client.controller.enqueue(`data: ${JSON.stringify(body)}\n\n`)
      }
      return new Response('Event sent', {status: 200})
    }
  }

  return new Response('Not Found', {status: 404})
}
