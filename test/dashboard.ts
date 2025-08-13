import {SharedEventSource} from '../index.ts'

const eventSource = new SharedEventSource('/sse')

const tabStatus = document.getElementById('tab-status')!
const eventsList = document.getElementById('events')!
const sendEventButton = document.getElementById('send-event')!
const readyStateElement = document.getElementById('ready-state')!
const customMessageInput = document.getElementById(
  'custom-message'
)! as HTMLInputElement

eventSource.onopen = () => {
  console.log('Connection opened')
}

eventSource.onmessage = event => {
  const li = document.createElement('li')
  li.textContent = `Received: ${event.data}`
  eventsList.appendChild(li)
}

eventSource.onerror = () => {
  console.error('Connection error')
}

// Update tab status based on leadership
const updateTabStatus = () => {
  if (
    eventSource.readyState === SharedEventSource.OPEN &&
    eventSource.isLeader
  ) {
    tabStatus.textContent = 'Leader'
    tabStatus.className = 'leader'
  } else {
    tabStatus.textContent = 'Follower'
    tabStatus.className = 'follower'
  }
}

// Update the readyState dynamically in the UI
const updateReadyState = () => {
  const stateMap = {
    [SharedEventSource.CONNECTING]: 'CONNECTING',
    [SharedEventSource.OPEN]: 'OPEN',
    [SharedEventSource.CLOSED]: 'CLOSED'
  }
  readyStateElement.textContent = stateMap[eventSource.readyState]
}

setInterval(updateTabStatus, 1000)
setInterval(updateReadyState, 1000)

sendEventButton.addEventListener('click', () => {
  const message = customMessageInput.value
  if (message) {
    const li = document.createElement('li')
    li.textContent = `Sent: ${message}`
    eventsList.appendChild(li)

    // Send the message to the /sse endpoint
    fetch('/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({message})
    }).then(response => {
      if (!response.ok) {
        console.error('Failed to send message')
      }
    })
  }
})
