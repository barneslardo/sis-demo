import { useEffect, useRef, useState } from "react";
import { api } from "../api";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatModel = { id: string; label: string; provider: string };

const STORAGE_KEY = "sis_admin_chat";

export function AdminChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState("grok-4.3");
  const [provider, setProvider] = useState("grok");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved) as ChatMessage[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  }, [messages]);

  useEffect(() => {
    if (open && !models.length) {
      api.getChatModels().then(({ data }) => {
        setModels(data);
        const preferred =
          data.find((m) => m.id === "grok-4.3") ??
          data.find((m) => m.provider === "grok") ??
          data[0];
        if (preferred) {
          setModel(preferred.id);
          setProvider(preferred.provider);
        }
      }).catch(() => undefined);
    }
  }, [open, models.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const { data } = await api.sendChat({
        messages: nextMessages,
        model,
        provider,
      });
      setMessages([...nextMessages, { role: "assistant", content: data.content }]);
    } catch (err) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="chat-fab"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="SIS Assistant"
      >
        {open ? "×" : "Ask SIS"}
      </button>

      {open && (
        <aside className="chat-panel" aria-label="SIS admin assistant">
          <header className="chat-panel-header">
            <div>
              <strong>SIS Assistant</strong>
              <p>Search and manage student records with natural language.</p>
            </div>
            {models.length > 0 && (
              <select
                value={model}
                onChange={(e) => {
                  const picked = models.find((m) => m.id === e.target.value);
                  setModel(e.target.value);
                  if (picked) setProvider(picked.provider);
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </header>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                Try: &quot;How many students are enrolled?&quot; or &quot;Find students named Alice&quot;
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="chat-bubble chat-bubble-assistant">Thinking…</div>}
            <div ref={bottomRef} />
          </div>

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about students…"
              disabled={loading}
            />
            <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
