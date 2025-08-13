import {SharedEventSource} from '../index.ts'

const eventSource = new SharedEventSource('/sse')

const tabStatus = document.getElementById('tab-status')!
const eventsList = document.getElementById('events')!
const sendEventButton = document.getElementById('send-event')!

eventSource.onopen = () => {
  console.log('Connection opened')
}

eventSource.onmessage = event => {
  const li = document.createElement('li')
  li.textContent = `Message: ${event.data}`
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

setInterval(updateTabStatus, 1000)

sendEventButton.addEventListener('click', () => {
  fetch('/sse', {
    method: 'POST',
    body: JSON.stringify({message: 'Hello from tab!'}),
    headers: {
      'Content-Type': 'application/json'
    }
  })
})
