"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageFooter,
} from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SendIcon, MessageSquareIcon, ShieldCheckIcon } from "lucide-react"

export type ChatMessage = {
  id: string
  role: "user" | "other" | "system"
  sender?: {
    name: string
    avatar?: string
    initials: string
    color: string
  }
  text: string
  time: string
}

const TRADER_NAMES = [
  { name: "BullishBilly", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { name: "WhaleAlert", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { name: "MoonGazer", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { name: "HODL_Master", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { name: "CoinCrusader", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  { name: "PaperHandsJoe", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  { name: "CryptoQueen", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
]

const SIMULATED_COMMENTS = [
  "AURX is looking ready for a breakout 📈",
  "Who else is buying this dip?",
  "What's the current consensus? Buy or sell?",
  "Centralized exchanges are so much faster, order executed in 5ms!",
  "Just simulated a 1000 AURX buy. Wallet is looking fat.",
  "Whales are moving funds... prepare for volatility!",
  "BTC $100k incoming! 🚀",
  "ETH gas fees on-chain are crazy, glad I can trade AURX instantly here.",
  "Is the Aurax launchpool live yet?",
  "This UI is insanely clean, love the dark mode theme!",
  "Just closed my short position. Going long now 🚀",
  "Anyone else tracking the orderbook volume? Massive buy wall at $12.20!",
]

type TradingChatContainerProps = {
  systemEvents: ChatMessage[]
  onNewUserMessage: (text: string) => void
}

export default function TradingChatContainer({ systemEvents, onNewUserMessage }: TradingChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Generate initial messages
    return [
      {
        id: "init-1",
        role: "system",
        text: "Welcome to the Aurax Global Trading Floor Chat",
        time: new Date(Date.now() - 300000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      {
        id: "init-2",
        role: "other",
        sender: { name: "HODL_Master", initials: "HM", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
        text: "Aurax feels extremely snappy. No lag on order placements.",
        time: new Date(Date.now() - 200000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      {
        id: "init-3",
        role: "other",
        sender: { name: "CryptoQueen", initials: "CQ", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
        text: "Agreed! Plus the interface looks incredible. Love the clean aesthetic. ✨",
        time: new Date(Date.now() - 100000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]
  })

  const [inputVal, setInputVal] = useState("")

  // Append external system events (like user orders executed)
  useEffect(() => {
    if (systemEvents.length > 0) {
      const latestEvent = systemEvents[systemEvents.length - 1]
      setMessages((prev) => {
        // Prevent duplicate appends if already present
        if (prev.some((m) => m.id === latestEvent.id)) return prev
        return [...prev, latestEvent]
      })
    }
  }, [systemEvents])

  // Periodic simulated commentary
  useEffect(() => {
    const interval = setInterval(() => {
      const randomTrader = TRADER_NAMES[Math.floor(Math.random() * TRADER_NAMES.length)]
      const randomComment = SIMULATED_COMMENTS[Math.floor(Math.random() * SIMULATED_COMMENTS.length)]

      const newMsg: ChatMessage = {
        id: `sim-${Date.now()}`,
        role: "other",
        sender: {
          name: randomTrader.name,
          initials: randomTrader.name.substring(0, 2).toUpperCase(),
          color: randomTrader.color,
        },
        text: randomComment,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }

      setMessages((prev) => [...prev, newMsg])
    }, 8000)

    return () => clearInterval(interval)
  }, [])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim()) return

    const userMsgText = inputVal.trim()
    setInputVal("")

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      sender: {
        name: "You",
        initials: "U",
        color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      },
      text: userMsgText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }

    setMessages((prev) => [...prev, userMsg])
    onNewUserMessage(userMsgText)
  }

  return (
    <div className="flex flex-col h-[600px] border border-border/50 rounded-xl bg-card/10 overflow-hidden backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 bg-card/25 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4 text-emerald-400" />
          <div>
            <h3 className="text-sm font-semibold">Trading Chat</h3>
            <p className="text-[10px] text-muted-foreground">2,841 traders online</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10 text-[10px]">
          <ShieldCheckIcon className="size-3" />
          <span>Encrypted Feed</span>
        </div>
      </div>

      {/* Message Scroller */}
      <div className="flex-1 min-h-0 bg-transparent relative">
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="h-full">
            <MessageScrollerViewport className="p-4">
              <MessageScrollerContent className="flex flex-col gap-4">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    {message.role === "system" ? (
                      <Marker variant="separator" className="my-2">
                        <MarkerContent className="text-[10px] tracking-wider uppercase font-semibold text-muted-foreground/80">
                          {message.text}
                        </MarkerContent>
                      </Marker>
                    ) : (
                      <Message align={message.role === "user" ? "end" : "start"} className="gap-2.5">
                        {message.role !== "user" && (
                          <MessageAvatar>
                            <Avatar size="sm" className={`border ${message.sender?.color || "bg-muted text-muted-foreground"}`}>
                              <AvatarFallback className="text-[10px] font-bold">
                                {message.sender?.initials}
                              </AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                        )}
                        <MessageContent className="gap-1">
                          {message.role !== "user" && (
                            <MessageHeader className="text-[11px] font-semibold text-foreground/80">
                              {message.sender?.name}
                            </MessageHeader>
                          )}
                          <Bubble variant={message.role === "user" ? "default" : "secondary"}>
                            <BubbleContent className={`text-xs py-1.5 px-3 rounded-xl border border-transparent ${
                              message.role === "user" 
                                ? "bg-emerald-500 text-white border-emerald-400/20" 
                                : "bg-muted/40 text-foreground border-border/30"
                            }`}>
                              {message.text}
                            </BubbleContent>
                          </Bubble>
                          <MessageFooter className="text-[9px] text-muted-foreground/50 px-1 mt-0.5">
                            {message.time}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-border/50 bg-card/20 shrink-0 flex gap-2 items-center">
        <Input
          type="text"
          placeholder="Send a message to trading floor..."
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          className="flex-1 bg-muted/30 border-border/60 text-xs h-8 focus-visible:ring-emerald-500/20"
        />
        <Button
          type="submit"
          size="icon-sm"
          className="size-8 bg-emerald-500 hover:bg-emerald-600 text-white border-none shrink-0"
        >
          <SendIcon className="size-3.5" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  )
}
