'use client'
import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/money'

interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  senderRole: string
  message: string
  createdAt: string
}

export function ChatWidget({ bookingId, currentUserId, currentUserName, currentUserRole, otherUserName }: {
  bookingId: string
  currentUserId: string
  currentUserName: string
  currentUserRole: string
  otherUserName: string
}) {
  const { t, locale } = useT()
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [otherTyping, setOtherTyping] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const roomId = `booking-${bookingId}`

  useEffect(() => {
    // Connect to chat service via gateway
    const sock = io('/?XTransformPort=3003', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    socketRef.current = sock

    sock.on('connect', () => {
      setConnected(true)
      sock.emit('auth', { userId: currentUserId, name: currentUserName, role: currentUserRole })
      sock.emit('join-room', roomId)
    })

    sock.on('disconnect', () => setConnected(false))
    sock.on('connect_error', () => setConnected(false))

    sock.on('message-history', (history: ChatMessage[]) => {
      setMessages(history)
    })

    sock.on('new-message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg])
      if (msg.senderId !== currentUserId) {
        setOtherTyping(false)
      }
    })

    sock.on('user-typing', () => setOtherTyping(true))
    sock.on('user-stop-typing', () => setOtherTyping(false))

    return () => {
      sock.emit('leave-room', roomId)
      sock.disconnect()
    }
  }, [bookingId, currentUserId, currentUserName, currentUserRole]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function sendMessage() {
    if (!input.trim() || !socketRef.current || !connected) return
    socketRef.current.emit('send-message', {
      roomId,
      message: input.trim(),
      senderId: currentUserId,
      senderName: currentUserName,
      senderRole: currentUserRole,
    })
    setInput('')
    socketRef.current.emit('stop-typing', { roomId })
  }

  function handleTyping(value: string) {
    setInput(value)
    if (!socketRef.current || !connected) return
    socketRef.current.emit('typing', { roomId, userId: currentUserId, name: currentUserName })
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit('stop-typing', { roomId })
    }, 2000)
  }

  return (
    <div className="flex flex-col h-[500px] rounded-[16px] border border-divider bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {otherUserName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {connected && (
              <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full bg-success border-2 border-surface" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{otherUserName}</p>
            <p className="text-[11px] text-muted-foreground">
              {connected ? '🟢 Online' : '⚫ Disconnected'}
            </p>
          </div>
        </div>
        <Icon name="chat" size={18} className="text-muted-foreground" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 bg-surface-secondary/30">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Icon name="forum" size={32} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId
          return (
            <div key={msg.id} className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
              {!isMe && (
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                    {msg.senderName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn('max-w-[75%]', isMe && 'text-end')}>
                <div className={cn(
                  'inline-block rounded-[14px] px-3 py-2 text-sm',
                  isMe ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-surface border border-divider text-foreground'
                )}>
                  {msg.message}
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDateTime(msg.createdAt, locale)}
                </p>
              </div>
            </div>
          )
        })}
        {otherTyping && (
          <div className="flex gap-2">
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                {otherUserName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="rounded-[14px] rounded-tl-sm bg-surface border border-divider px-4 py-3">
              <div className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: '0ms' }} />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: '150ms' }} />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-divider p-3">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={connected ? 'Type a message...' : 'Connecting...'}
            disabled={!connected}
            className="flex-1"
          />
          <Button size="icon" onClick={sendMessage} disabled={!connected || !input.trim()}>
            <Icon name="send" size={18} />
          </Button>
        </div>
      </div>
    </div>
  )
}
