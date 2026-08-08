import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

// Store active connections by userId
const connectedUsers = new Map<string, string>() // userId -> socketId

// Store messages in memory (in production, use Redis or database)
const messageStore = new Map<string, any[]>() // roomId -> messages[]

io.on('connection', (socket) => {
  console.log(`[chat] Client connected: ${socket.id}`)

  // User authenticates with their userId
  socket.on('auth', (data: { userId: string; name: string; role: string }) => {
    connectedUsers.set(data.userId, socket.id)
    socket.data.userId = data.userId
    socket.data.name = data.name
    socket.data.role = data.role
    console.log(`[chat] User authenticated: ${data.name} (${data.userId})`)
  })

  // Join a chat room (booking-based)
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId)
    console.log(`[chat] ${socket.data.name} joined room: ${roomId}`)

    // Send existing messages
    const messages = messageStore.get(roomId) || []
    socket.emit('message-history', messages)
  })

  // Leave a room
  socket.on('leave-room', (roomId: string) => {
    socket.leave(roomId)
    console.log(`[chat] ${socket.data.name} left room: ${roomId}`)
  })

  // Send a message
  socket.on('send-message', (data: {
    roomId: string
    message: string
    senderId: string
    senderName: string
    senderRole: string
  }) => {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      roomId: data.roomId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderRole: data.senderRole,
      message: data.message,
      createdAt: new Date().toISOString(),
    }

    // Store message (keep last 100 per room)
    if (!messageStore.has(data.roomId)) messageStore.set(data.roomId, [])
    messageStore.get(data.roomId)!.push(msg)
    if (messageStore.get(data.roomId)!.length > 100) {
      messageStore.get(data.roomId)!.shift()
    }

    // Broadcast to everyone in the room
    io.to(data.roomId).emit('new-message', msg)
    console.log(`[chat] Message in ${data.roomId} from ${data.senderName}: ${data.message.slice(0, 50)}`)
  })

  // Typing indicator
  socket.on('typing', (data: { roomId: string; userId: string; name: string }) => {
    socket.to(data.roomId).emit('user-typing', { userId: data.userId, name: data.name })
  })

  socket.on('stop-typing', (data: { roomId: string }) => {
    socket.to(data.roomId).emit('user-stop-typing')
  })

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.data.userId) {
      connectedUsers.delete(socket.data.userId)
    }
    console.log(`[chat] Client disconnected: ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`🚀 MedTravel Chat Service running on port ${PORT}`)
})
