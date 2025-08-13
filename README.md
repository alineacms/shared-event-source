# shared-event-source

[![npm version](https://badge.fury.io/js/shared-event-source.svg)](https://www.npmjs.com/package/shared-event-source)

`shared-event-source` is a library that provides a shared EventSource connection across multiple browser tabs. It ensures that only one actual EventSource connection is open per URL, while other tabs receive events via a BroadcastChannel. This is particularly useful to get around the browser limit of maximum 6 non HTTP/2 SSE connections per domain.

## Installation

Install the package via npm:

```bash
npm install shared-event-source
```

## Usage

The `SharedEventSource` class mimics the standard EventSource API but uses a BroadcastChannel and the Web Locks API to coordinate state between tabs.

### Example

```typescript
import {SharedEventSource} from 'shared-event-source'

const eventSource = new SharedEventSource('https://example.com/events')

eventSource.onopen = () => {
  console.log('Connection opened')
}

eventSource.onmessage = (event) => {
  console.log('Message received:', event.data)
}

eventSource.onerror = () => {
  console.error('An error occurred')
}

// Close the connection when done
// eventSource.close()
```

### Features

- Ensures only one EventSource connection per URL across all tabs.
- Automatically elects a new leader tab if the current leader closes.
- Broadcasts events to all tabs using the BroadcastChannel API.

## API

### `SharedEventSource`

#### Constructor

```typescript
new SharedEventSource(url: string, eventSourceInitDict?: EventSourceInit)
```

- `url`: The URL of the server-sent events stream.
- `eventSourceInitDict`: Optional configuration, same as the standard EventSource.

#### Properties

- `url`: The URL of the EventSource.
- `withCredentials`: Whether credentials are included in the request.
- `readyState`: The current state of the connection (`CONNECTING`, `OPEN`, or `CLOSED`).
- `onerror`: Callback for error events.
- `onmessage`: Callback for message events.
- `onopen`: Callback for open events.

#### Methods

- `close()`: Closes the connection for this instance.

#### Static Constants

- `CONNECTING`: The connection is being established.
- `OPEN`: The connection is open and receiving events.
- `CLOSED`: The connection is closed.

## Requirements

This library requires a browser environment with support for:

- `BroadcastChannel`
- `Web Locks API`

## License

MIT
