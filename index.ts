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

/**
 * A class that mimics the standard EventSource API but uses a BroadcastChannel
 * and the Web Locks API to ensure only one actual EventSource connection is open
 * per URL across all browser tabs.
 *
 * One tab is elected "leader" and manages the real connection. Other tabs are
 * "followers" and receive events via the BroadcastChannel from the leader.
 * If the leader tab is closed, a new leader is elected automatically.
 */
export class SharedEventSource extends EventTarget implements EventSource {
  // Public properties mimicking the EventSource interface
  public readonly url: string
  public readonly withCredentials: boolean
  public readyState: 0 | 1 | 2

  public onerror: (this: EventSource, ev: ErrorEvent) => any = <any>(
    Function.prototype
  )
  public onmessage: (this: EventSource, ev: MessageEvent) => any = <any>(
    Function.prototype
  )
  public onopen: (this: EventSource, ev: Event) => any = <any>Function.prototype

  // Constants for readyState
  public static readonly CONNECTING = 0
  public static readonly OPEN = 1
  public static readonly CLOSED = 2

  // Private properties for internal state management
  private readonly _id: string
  private readonly _channel: BroadcastChannel
  private _isLeader = false
  private _realEventSource: EventSource | null = null
  private _clients = new Set<string>()
  private _lockReleaseResolver: (() => void) | null = null

  /**
   * Creates an instance of SharedEventSource.
   * @param url The URL of the server-sent events stream.
   * @param eventSourceInitDict Optional configuration, same as the standard EventSource.
   */
  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    super()

    // Ensure this code runs in a browser environment with necessary APIs.
    if (
      typeof window === 'undefined' ||
      !window.BroadcastChannel ||
      !navigator.locks
    ) {
      throw new Error(
        'EventSourceChannel requires a browser environment with BroadcastChannel and Web Locks API support.'
      )
    }

    this.url = url
    this.withCredentials = eventSourceInitDict?.withCredentials ?? false
    this.readyState = SharedEventSource.CONNECTING

    // A unique ID for this specific instance in this tab.
    this._id = crypto.randomUUID()

    // The channel name is derived from the URL to ensure it's unique per stream.
    const channelName = `eventsource-channel:${this.url}`
    this._channel = new BroadcastChannel(channelName)
    this._channel.onmessage = this._handleBroadcastMessage.bind(this)

    // Set up event listeners for the on... properties
    this.addEventListener('open', e => this.onopen?.(e))
    this.addEventListener('message', e => this.onmessage?.(e as MessageEvent))
    this.addEventListener('error', e => this.onerror?.(e))

    this._attemptToBecomeLeader()
    this._broadcast({type: 'client-add', payload: {id: this._id}})
  }

  /**
   * Closes the connection for this instance. If this is the last active instance
   * across all tabs, the leader will close the actual EventSource connection.
   */
  public close(): void {
    if (this.readyState === SharedEventSource.CLOSED) {
      return
    }
    console.log(`[${this._id}] Closing connection.`)
    this.readyState = SharedEventSource.CLOSED
    this._broadcast({type: 'client-remove', payload: {id: this._id}})
    this._cleanup()
  }

  /**
   * Attempts to acquire a lock to become the leader tab. This uses the Web Locks API's
   * queuing mechanism. If a tab is already leader, new tabs will wait in a queue.
   * If the leader closes, the next tab in the queue is promoted.
   */
  private _attemptToBecomeLeader(): void {
    const lockName = `eventsource-leader-lock:${this.url}`

    navigator.locks.request(lockName, async () => {
      // This callback only runs when the lock is acquired. This tab is now the leader.
      this._isLeader = true
      console.log(`[${this._id}] Became leader.`)

      this._setupLeader()

      // The lock is held as long as this promise is pending. We create a promise
      // that will only resolve when the leader instance is ready to shut down.
      await new Promise<void>(resolve => {
        this._lockReleaseResolver = resolve
      })

      // When the promise resolves, the lock is released.
      console.log(`[${this._id}] Releasing leader lock.`)
      this._isLeader = false
      this._realEventSource?.close()
      this._realEventSource = null
    })
  }

  /**
   * Sets up the current tab to act as the leader. It creates the real EventSource
   * connection and prepares to broadcast events to followers.
   */
  private _setupLeader(): void {
    // As the new leader, initialize the client list with itself.
    this._clients.add(this._id)

    this._realEventSource = new EventSource(this.url, {
      withCredentials: this.withCredentials
    })

    this._realEventSource.onopen = () => {
      console.log(`[${this._id}] Leader connection opened.`)
      this._broadcast({type: 'event-open'})
    }

    this._realEventSource.onmessage = (event: MessageEvent) => {
      this._broadcast({
        type: 'event-message',
        payload: {
          data: event.data,
          origin: event.origin,
          lastEventId: event.lastEventId
        }
      })
    }

    this._realEventSource.onerror = () => {
      console.error(`[${this._id}] Leader connection error.`)
      this._broadcast({type: 'event-error'})
    }
  }

  /**
   * Handles all incoming messages from the BroadcastChannel.
   * @param event The message event from the channel.
   */
  private _handleBroadcastMessage(event: MessageEvent<BroadcastMessage>): void {
    const {type, payload} = event.data

    // --- Leader-specific message handling ---
    if (this._isLeader) {
      if (type === 'client-add') {
        this._clients.add(payload.id)
        console.log(
          `[${this._id}] Leader saw new client: ${payload.id}. Total: ${this._clients.size}`
        )
        // If the connection is already open, inform the new client immediately.
        if (this._realEventSource?.readyState === EventSource.OPEN) {
          this._broadcast({type: 'event-open'})
        }
      } else if (type === 'client-remove') {
        this._clients.delete(payload.id)
        console.log(
          `[${this._id}] Leader saw client leave: ${payload.id}. Total: ${this._clients.size}`
        )
        // If the last client leaves, the leader closes the connection and releases the lock.
        if (this._clients.size === 0) {
          console.log(
            `[${this._id}] Last client left. Leader is shutting down.`
          )
          this.close()
        }
      }
    }

    // --- Global message handling for all instances (leader and followers) ---
    switch (type) {
      case 'event-open':
        this.readyState = SharedEventSource.OPEN
        this.dispatchEvent(new Event('open'))
        break
      case 'event-message':
        // Reconstruct the MessageEvent to be dispatched locally.
        this.dispatchEvent(new MessageEvent('message', payload))
        break
      case 'event-error':
        this.dispatchEvent(new Event('error'))
        break
    }
  }

  /**
   * Broadcasts a message to all other tabs via the BroadcastChannel.
   * @param message The message to send.
   */
  private _broadcast(message: BroadcastMessage): void {
    this._channel.postMessage(message)
  }

  /**
   * Cleans up resources for this instance.
   */
  private _cleanup(): void {
    // If this instance was the leader, resolve the promise to release the lock.
    if (this._lockReleaseResolver) {
      this._lockReleaseResolver()
      this._lockReleaseResolver = null
    }

    this._channel.close()
    this.onopen = <any>Function.prototype
    this.onmessage = <any>Function.prototype
    this.onerror = <any>Function.prototype
  }
}
