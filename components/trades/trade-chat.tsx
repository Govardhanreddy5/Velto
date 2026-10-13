"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { TradeMessage } from "@/types/database";
import { sendTradeMessageAction, getTradeMessages } from "@/lib/trades/actions";
import { createClient } from "@/lib/supabase/client";
import {
  Send,
  Lock,
  Loader2,
  AlertCircle,
  MessageSquare,
  ShieldAlert,
  WifiOff,
  Sparkles,
} from "lucide-react";

interface TradeChatProps {
  tradeId: string;
  initialMessages: TradeMessage[];
  currentUserId: string;
  partnerName: string;
  partnerRole: "Requester" | "Fulfiller";
  tradeStatus: string;
  meetupLocation: string;
}

export function TradeChat({
  tradeId,
  initialMessages,
  currentUserId,
  partnerName,
  partnerRole,
  tradeStatus,
  meetupLocation,
}: TradeChatProps) {
  const [messages, setMessages] = useState<TradeMessage[]>(initialMessages);
  const [inputText, setInputText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "connecting" | "error">("connecting");
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isTradeActive = tradeStatus === "IN_PROGRESS";

  // Auto-scroll to bottom of chat
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "end",
    });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages]);

  // Secure fallback message refresher respecting RLS
  const refreshMessages = React.useCallback(async () => {
    try {
      const res = await getTradeMessages(tradeId);
      if (res.messages && res.messages.length > 0) {
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const m of res.messages) {
            if (!map.has(m.id)) {
              map.set(m.id, m);
            }
          }
          return Array.from(map.values()).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[TradeChat Fallback Refresh Error]:", err);
      }
    }
  }, [tradeId]);

  const realtimeStatusRef = useRef(realtimeStatus);
  useEffect(() => {
    realtimeStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  // Set up Supabase Realtime channel for in-trade chat
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let isMounted = true;
    let authSub: { unsubscribe: () => void } | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const initSubscription = async () => {
      // 1. Ensure access token is set on Realtime WebSocket for RLS authorization
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[TradeChat Auth Init Warning]:", err);
        }
      }

      // Listen for session refresh to keep Realtime authorized
      const { data } = supabase.auth.onAuthStateChange(async (_event: unknown, session: { access_token?: string } | null) => {
        if (session?.access_token) {
          try {
            await supabase.realtime.setAuth(session.access_token);
          } catch {
            // ignore
          }
        }
      });
      authSub = data.subscription;

      if (!isMounted) return;

      // 2. Create channel with strict trade filter
      channel = supabase
        .channel(`trade_chat_${tradeId}`)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          {
            event: "INSERT",
            schema: "public",
            table: "trade_messages",
            filter: `trade_id=eq.${tradeId}`,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: { new: Record<string, any> }) => {
            const newMsg = payload.new as TradeMessage;

            // Deduplicate: append once
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) {
                return prev;
              }

              // Enrich partner name if missing from raw WAL payload
              const enriched: TradeMessage = {
                ...newMsg,
                sender:
                  newMsg.sender ||
                  (newMsg.sender_id === currentUserId
                    ? undefined
                    : { full_name: partnerName }),
              };

              return [...prev, enriched];
            });
          }
        )
        .subscribe((status: string, err?: unknown) => {
          if (!isMounted) return;

          if (process.env.NODE_ENV === "development") {
            if (err) {
              console.error(`[TradeChat Subscription Error] Status: ${status}`, err);
            } else {
              console.log(`[TradeChat Realtime Status]: ${status}`);
            }
          }

          if (status === "SUBSCRIBED") {
            setRealtimeStatus("connected");
            // Sync any messages missed during connecting phase
            refreshMessages();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeStatus("error");
          } else {
            setRealtimeStatus("connecting");
          }
        });
    };

    initSubscription();

    // 3. Fallback refresh when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshMessages();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 4. Fallback interval if realtime is offline or connecting
    const fallbackInterval = setInterval(() => {
      if (realtimeStatusRef.current !== "connected") {
        refreshMessages();
      }
    }, 6000);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(fallbackInterval);
      if (authSub) authSub.unsubscribe();
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [tradeId, currentUserId, partnerName, refreshMessages]);


  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = inputText.trim();
    if (!trimmed || isSending || !isTradeActive) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      const res = await sendTradeMessageAction(tradeId, trimmed);

      if (!res.success || !res.message) {
        setErrorMessage(res.error || "Failed to send message. Please retry.");
        setIsSending(false);
        return;
      }

      // Add message locally avoiding duplicate
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message!.id)) return prev;
        return [...prev, res.message!];
      });

      setInputText("");

      // Reset textarea height if expanded
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      setErrorMessage("Network error sending message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickSnippet = (text: string) => {
    if (!isTradeActive) return;
    setInputText(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200/90 shadow-sm overflow-hidden flex flex-col h-[580px]">
      {/* Chat Header */}
      <div className="p-4 px-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center font-bold text-sm">
            {partnerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-950">{partnerName}</h3>
              <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-200/70 px-1.5 py-0.5 rounded">
                {partnerRole}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              Private in-trade coordination
            </p>
          </div>
        </div>

        {/* Realtime Status Badge & Report Action */}
        <div className="flex items-center gap-2">
          {realtimeStatus === "connected" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          ) : realtimeStatus === "connecting" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
              Connecting
            </span>
          ) : (
            <span
              title="Realtime connection paused"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 cursor-help"
            >
              <WifiOff className="w-3 h-3 text-rose-600" />
              Offline
            </span>
          )}

          {/* Safety / Report Placeholder Button */}
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Report Safety Issue"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-white to-zinc-50/40">
        {/* Meetup Reminder Top Box */}
        <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Designated spot: <strong>{meetupLocation}</strong>
            </span>
          </div>
          <span className="text-[11px] font-medium text-blue-600 shrink-0">
            Never share OTPs or PINs
          </span>
        </div>

        {/* Empty State */}
        {messages.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center border border-zinc-200">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-zinc-900">
                Start coordinating your meetup
              </h4>
              <p className="text-xs text-zinc-500 max-w-xs">
                Message {partnerName} to confirm the exact landmark or timing at{" "}
                {meetupLocation}.
              </p>
            </div>

            {/* Quick Starter Chips */}
            {isTradeActive && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(`Hey! I'm heading to ${meetupLocation} now.`)
                  }
                  className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer"
                >
                  I&apos;m heading there now
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickSnippet(
                      "I have reached the meetup location. Where are you?"
                    )
                  }
                  className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer"
                >
                  I&apos;ve reached the spot
                </button>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                {/* Sender Tag & Timestamp */}
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1 px-1">
                  {!isMe && (
                    <span className="font-semibold text-zinc-700">
                      {msg.sender?.full_name || partnerName}
                    </span>
                  )}
                  <span>{timeStr}</span>
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm break-words whitespace-pre-wrap ${
                    isMe
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-zinc-100 text-zinc-900 border border-zinc-200/80 rounded-bl-sm"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer Section */}
      <div className="p-4 border-t border-zinc-100 bg-white">
        {errorMessage && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isTradeActive ? (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="relative flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                onKeyDown={handleKeyDown}
                maxLength={1000}
                placeholder={`Message ${partnerName}... (Press Enter to send)`}
                rows={1}
                disabled={isSending}
                className="flex-1 bg-transparent border-0 text-xs text-zinc-950 placeholder-zinc-400 focus:outline-none resize-none min-h-[38px] max-h-24 p-1.5"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-sm shadow-blue-500/10"
                title="Send message"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
              <span>Press Shift+Enter for new line</span>
              <span>{inputText.length}/1000</span>
            </div>
          </form>
        ) : (
          <div className="p-3 text-center rounded-xl bg-zinc-100 text-zinc-500 text-xs">
            Trade is <strong>{tradeStatus}</strong>. Messaging is closed for this
            room.
          </div>
        )}
      </div>

      {/* Safety Report Placeholder Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-zinc-200 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-950">Safety Report</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Formal incident reporting will be activated in an upcoming milestone.
                For urgent campus safety concerns, please contact your Campus Security
                or Hostel Warden immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReportModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
