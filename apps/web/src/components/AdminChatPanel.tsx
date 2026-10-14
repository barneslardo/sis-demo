import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatModel = { id: string; label: string; provider: string };

const STORAGE_KEY = "sis_admin_chat";

export function AdminChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState("gemma4");
  const [provider, setProvider] = useState("litellm");
  const listRef = useRef<HTMLDivElement>(null);
  const lastUserRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

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
          data.find((m) => m.id === "gemma4") ?? data[0];
        if (preferred) {
          setModel(preferred.id);
          setProvider(preferred.provider);
        }
      }).catch(() => undefined);
    }
  }, [open, models.length]);

  // Keep the latest question at the top of the list so the answer reads
  // downward from it rather than landing the reader at the bottom of a long
  // reply. The spacer lets a short reply sit directly under its question.
  useEffect(() => {
    const list = listRef.current;
    const anchor = lastUserRef.current;
    if (!list) return;
    if (!anchor) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      return;
    }
    const spacer = spacerRef.current;
    if (spacer) {
      spacer.style.height = "0px";
      const tail = list.scrollHeight - anchor.offsetTop;
      spacer.style.height = `${Math.max(0, list.clientHeight - tail - 12)}px`;
    }
    list.scrollTo({ top: Math.max(0, anchor.offsetTop - 12), behavior: "smooth" });
  }, [messages, loading, error, open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    await request(nextMessages);
  }

  // Errors stay out of the transcript: they are shown as a notice, never saved
  // to localStorage, and never sent back to the model as conversation history.
  async function request(history: ChatMessage[]) {
    setLoading(true);
    try {
      const { data } = await api.sendChat({ messages: history, model, provider });
      setMessages([...history, { role: "assistant", content: data.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

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
            <div className="chat-panel-header-actions">
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
              {messages.length > 0 && (
                <button type="button" className="chat-clear" onClick={clearHistory} title="Clear conversation">
                  Clear
                </button>
              )}
            </div>
          </header>

          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                Try: &quot;How many students are enrolled?&quot; or &quot;Find students named Alice&quot;
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="chat-bubble chat-bubble-user"
                  ref={i === lastUserIndex ? lastUserRef : undefined}
                >
                  {m.content}
                </div>
              ) : (
                <div key={i} className="chat-bubble chat-bubble-assistant chat-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )
            )}
            {loading && <div className="chat-bubble chat-bubble-assistant chat-thinking">Thinking…</div>}
            {error && !loading && (
              <div className="chat-error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => void request(messages)}>
                  Try again
                </button>
              </div>
            )}
            <div ref={spacerRef} aria-hidden="true" className="chat-spacer" />
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
