/**
 * Defines the shape of messages passed through the BroadcastChannel to coordinate state
 * between tabs.
 */
interface BroadcastMessage {
  type:
    | 'client-add' // A new tab has opened and created an instance.
    | 'client-remove' // A tab has closed its instance.
    | 'event-open' // The leader has successfully connected the EventSource.
    | 'event-message' // The leader has received a message.
    | 'event-error' // The leader's EventSource encountered an error.
    | 'leader-closing' // The leader is closing the connection.
  payload?: any
}

const noop: any = Function.prototype

/**
 * A class that mimics the standard EventSource API but uses a BroadcastChannel
 * and the Web Locks API to ensure only one actual EventSource connection is open
 * per URL across all browser tabs.
 *
 * One tab is elected "leader" and manages the real connection. Other tabs are
 * "followers" and receive events via the BroadcastChannel from the leader.
 * If the leader tab is closed, a new leader is elected automatically.
 */
export class SharedEventSource extends EventTarget {
  // Public properties mimicking the EventSource interface
  readonly url: string
  readonly withCredentials: boolean
  readyState: 0 | 1 | 2

  onerror: (event: ErrorEvent) => any = noop
  onmessage: (event: MessageEvent) => any = noop
  onopen: (event: Event) => any = noop

  // Constants for readyState
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  isLeader = false

  // Private properties for internal state management
  readonly #id: string
  readonly #channel: BroadcastChannel
  #realEventSource: EventSource | null = null
  #clients = new Set<string>()
  #lockReleaseResolver: (() => void) | null = null

  /**
   * Creates an instance of SharedEventSource.
   * @param url The URL of the server-sent events stream.
   * @param eventSourceInitDict Optional configuration, same as the standard EventSource.
   */
  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    super()

    // Ensure this code runs in a browser environment with necessary APIs.
    if (!globalThis.BroadcastChannel || !navigator.locks) {
      throw new Error(
        'EventSourceChannel requires a browser environment with BroadcastChannel and Web Locks API support.'
      )
    }

    this.url = url
    this.withCredentials = eventSourceInitDict?.withCredentials ?? false
    this.readyState = SharedEventSource.CONNECTING

    // A unique ID for this specific instance in this tab.
    this.#id = crypto.randomUUID()

    // The channel name is derived from the URL to ensure it's unique per stream.
    const channelName = `eventsource-channel:${this.url}`
    this.#channel = new BroadcastChannel(channelName)
    this.#channel.onmessage = this.#handleBroadcastMessage.bind(this)

    // Set up event listeners for the on... properties
    this.addEventListener('open', e => this.onopen(e))
    this.addEventListener('message', e => this.onmessage(e as MessageEvent))
    this.addEventListener('error', e => this.onerror(e as ErrorEvent))

    this.#attemptToBecomeLeader()
    this.#broadcast({type: 'client-add', payload: {id: this.#id}})
  }

  /**
   * Closes the connection for this instance. If this is the last active instance
   * across all tabs, the leader will close the actual EventSource connection.
   */
  public close(): void {
    if (this.readyState === SharedEventSource.CLOSED) {
      return
    }
    this.readyState = SharedEventSource.CLOSED
    this.#broadcast({type: 'client-remove', payload: {id: this.#id}})
    this.#cleanup()
  }

  /**
   * Attempts to acquire a lock to become the leader tab. This uses the Web Locks API's
   * queuing mechanism. If a tab is already leader, new tabs will wait in a queue.
   * If the leader closes, the next tab in the queue is promoted.
   */
  #attemptToBecomeLeader(): void {
    const lockName = `eventsource-leader-lock:${this.url}`

    navigator.locks.request(lockName, async () => {
      this.isLeader = true

      this.#setupLeader()

      await new Promise<void>(resolve => {
        this.#lockReleaseResolver = resolve
      })

      this.isLeader = false
      this.#realEventSource?.close()
      this.#realEventSource = null
    })
  }

  /**
   * Sets up the current tab to act as the leader. It creates the real EventSource
   * connection and prepares to broadcast events to followers.
   */
  #setupLeader(): void {
    // As the new leader, initialize the client list with itself.
    this.#clients.add(this.#id)

    this.#realEventSource = new EventSource(this.url, {
      withCredentials: this.withCredentials
    })

    this.#realEventSource.onopen = () => {
      this.readyState = SharedEventSource.OPEN // Update readyState to OPEN
      this.#broadcast({type: 'event-open'})
    }

    this.#realEventSource.onmessage = (event: MessageEvent) => {
      this.#broadcast({
        type: 'event-message',
        payload: {
          data: event.data,
          origin: event.origin,
          lastEventId: event.lastEventId
        }
      })
    }

    this.#realEventSource.onerror = () => {
      this.readyState = SharedEventSource.CLOSED // Update readyState to CLOSED
      this.#broadcast({type: 'event-error'})
    }
  }

  /**
   * Handles all incoming messages from the BroadcastChannel.
   * @param event The message event from the channel.
   */
  #handleBroadcastMessage(event: MessageEvent<BroadcastMessage>): void {
    const {type, payload} = event.data

    if (this.isLeader) {
      if (type === 'client-add') {
        this.#clients.add(payload.id)
        if (this.#realEventSource?.readyState === EventSource.OPEN) {
          this.#broadcast({type: 'event-open'})
        }
      } else if (type === 'client-remove') {
        this.#clients.delete(payload.id)
        if (this.#clients.size === 0) {
          this.close()
        }
      }
    }

    switch (type) {
      case 'event-open':
        this.readyState = SharedEventSource.OPEN
        this.dispatchEvent(new Event('open'))
        break
      case 'event-message':
        this.dispatchEvent(new MessageEvent('message', payload))
        break
      case 'event-error':
        this.readyState = SharedEventSource.CLOSED
        this.dispatchEvent(new Event('error'))
        break
    }
  }

  /**
   * Broadcasts a message to all other tabs via the BroadcastChannel.
   * @param message The message to send.
   */
  #broadcast(message: BroadcastMessage): void {
    this.#channel.postMessage(message)

    // Process the message locally if this instance is the leader.
    if (this.isLeader) {
      this.#handleBroadcastMessage({
        data: message
      } as MessageEvent<BroadcastMessage>)
    }
  }

  /**
   * Cleans up resources for this instance.
   */
  #cleanup(): void {
    // If this instance was the leader, resolve the promise to release the lock.
    if (this.#lockReleaseResolver) {
      this.#lockReleaseResolver()
      this.#lockReleaseResolver = null
    }

    this.#channel.close()
    this.onopen = <any>Function.prototype
    this.onmessage = <any>Function.prototype
    this.onerror = <any>Function.prototype
  }
}
