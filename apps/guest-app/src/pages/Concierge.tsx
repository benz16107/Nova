import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGuestToken, useGuestAuth } from "../guestToken";

const WS_BASE = (() => {
  const u = typeof window !== "undefined" ? window.location : { protocol: "http:", host: "localhost:5173" };
  return (u.protocol === "https:" ? "wss:" : "ws:") + "//" + u.host;
})();

type InputMode = "voice" | "text";
type OutputMode = "voice" | "text";

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function Concierge() {
  const token = useGuestToken();
  const { setGuestToken } = useGuestAuth();
  const navigate = useNavigate();
  const [guestName, setGuestName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [outputMode, setOutputMode] = useState<OutputMode>("voice");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [textInput, setTextInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const didOpenRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const streamingRef = useRef("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const disconnect = useCallback((resetStatus = true) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (resetStatus) setStatus("idle");
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Fetch guest name for welcome text
  useEffect(() => {
    if (!token) return;
    fetch(`/api/me?guest_token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { guest?: { firstName?: string }; conciergeAllowed?: boolean }) => {
        if (data?.guest?.firstName) setGuestName(data.guest.firstName);
      })
      .catch(() => {});
  }, [token]);

  // Poll guest status so we show "Account disabled" soon after check-out without refresh
  useEffect(() => {
    if (!token || (status !== "idle" && status !== "connected")) return;
    const check = async () => {
      try {
        const r = await fetch(`/api/me?guest_token=${encodeURIComponent(token)}`);
        const data = (await r.json()) as { conciergeAllowed?: boolean; error?: string } | undefined;
        if (!r.ok || data?.conciergeAllowed === false) {
          disconnect(false);
          navigate("/", { replace: true });
        }
      } catch {
        // ignore network errors; keep existing state
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [token, status, disconnect]);

  function start() {
    setStatus("connecting");
    setErrorMsg("");
    setMessages([]);
    setStreamingText("");
    if (!token) {
      setErrorMsg("Not activated. Go back and enter your room number and last name.");
      setStatus("error");
      return;
    }
    didOpenRef.current = false;
    nextPlayTimeRef.current = 0;
    let ws: WebSocket;
    try {
      const params = new URLSearchParams({
        guest_token: token,
        input_mode: inputMode,
        output_mode: outputMode,
      });
      const url = `${WS_BASE.replace(/\/$/, "")}/api/realtime/connect?${params.toString()}`;
      ws = new WebSocket(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to connect");
      setStatus("error");
      return;
    }
    wsRef.current = ws;

    const timeout = window.setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        setErrorMsg("Connection timed out. Is the backend running on port 3000?");
        setStatus("error");
      }
    }, 15000);

    ws.onopen = async () => {
      window.clearTimeout(timeout);
      didOpenRef.current = true;
      setStatus("connected");
      // Create AudioContext when we need it: for playback (voice out) or for mic (voice in)
      if (outputMode === "voice" || inputMode === "voice") {
        const ctx = new AudioContext({ sampleRate: 24000 });
        audioContextRef.current = ctx;
        ctx.resume().catch(() => {});
      }
      if (inputMode === "voice") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const ctx = audioContextRef.current;
          if (ctx) {
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(ctx.destination);
            processor.onaudioprocess = (e) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              const bytes = new Uint8Array(pcm16.buffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i += 8192) {
                binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
              }
              const b64 = btoa(binary);
              ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
            };
          }
        } catch (err) {
          setErrorMsg("Microphone access denied");
          setStatus("error");
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          error?: string;
          message?: string;
          delta?: string;
          transcript?: string;
        };
        if (msg.type === "error") {
          const err = msg.error ?? msg.message;
          const text =
            typeof err === "string"
              ? err
              : err &&
                  typeof err === "object" &&
                  "message" in err &&
                  typeof (err as { message?: unknown }).message === "string"
                ? (err as { message: string }).message
                : JSON.stringify(err);
          setErrorMsg(text || "Something went wrong.");
          setStatus("error");
          return;
        }
        // User spoke (voice input): show transcript in chat
        if (msg.type === "conversation.item.input_audio_transcription.completed") {
          const transcript = typeof msg.transcript === "string" ? msg.transcript.trim() : "";
          if (transcript) {
            setMessages((prev) => [...prev, { role: "user", text: transcript }]);
          }
        }
        if (outputMode === "voice" && msg.type === "response.output_audio.delta" && msg.delta) {
          const ctx = audioContextRef.current;
          if (ctx) {
            const bytes = Uint8Array.from(atob(msg.delta), (c) => c.charCodeAt(0));
            const samples = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(samples.length);
            for (let i = 0; i < samples.length; i++) float32[i] = samples[i] / (samples[i] < 0 ? 0x8000 : 0x7fff);
            const buffer = ctx.createBuffer(1, float32.length, 24000);
            buffer.getChannelData(0).set(float32);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            const now = ctx.currentTime;
            if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
            const startTime = nextPlayTimeRef.current;
            source.start(startTime);
            source.stop(startTime + buffer.duration);
            nextPlayTimeRef.current = startTime + buffer.duration;
          }
        }
        if (outputMode === "voice" && (msg.type === "response.done" || msg.type === "response.output_audio.done")) {
          nextPlayTimeRef.current = 0;
        }
        // Agent response text: show in transcript (text mode)
        if (msg.type === "response.output_text.delta" && typeof msg.delta === "string") {
          streamingRef.current += msg.delta;
          setStreamingText(streamingRef.current);
        }
        if (msg.type === "response.output_text.done") {
          const final = streamingRef.current;
          streamingRef.current = "";
          setStreamingText("");
          if (final) setMessages((prev) => [...prev, { role: "assistant", text: final }]);
        }
        // Agent response audio transcript: show in transcript (voice mode) – streamed then finalized
        if (msg.type === "response.output_audio_transcript.delta" && typeof msg.delta === "string") {
          streamingRef.current += msg.delta;
          setStreamingText(streamingRef.current);
        }
        if (msg.type === "response.output_audio_transcript.done" && typeof msg.transcript === "string") {
          const final = (msg.transcript as string).trim() || streamingRef.current;
          streamingRef.current = "";
          setStreamingText("");
          if (final) setMessages((prev) => [...prev, { role: "assistant", text: final }]);
        }
      } catch {
        // ignore non-JSON or other events
      }
    };

    ws.onclose = (ev) => {
      window.clearTimeout(timeout);
      const wasConnecting = !didOpenRef.current;
      disconnect(false);
      if (wasConnecting) {
        setErrorMsg((prev) => prev || ev.reason || "Connection closed. Check backend is running and OPENAI_API_KEY is set.");
        setStatus("error");
      }
    };
    ws.onerror = () => {
      window.clearTimeout(timeout);
      setErrorMsg("Connection error. Ensure backend is running at http://localhost:3000.");
      setStatus("error");
    };
  }

  function sendText() {
    const t = textInput.trim();
    if (!t || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { role: "user", text: t }]);
    setTextInput("");
    wsRef.current.send(JSON.stringify({ type: "guest_text", text: t }));
  }

  useEffect(() => () => disconnect(), [disconnect]);

  function handleLogOut() {
    disconnect();
    setGuestToken(null);
    navigate("/activate", { replace: true });
  }

  return (
    <div className="g-screen">
      <nav className="g-nav">
        <Link to="/" className="g-nav-back">← Back</Link>
        <button type="button" className="g-btn g-btn-ghost" onClick={handleLogOut}>Log out</button>
      </nav>

      <h1 className="g-page-title g-mb-1" style={{ marginTop: 8 }}>Nova</h1>
      {guestName && <p className="g-subtitle g-mb-2" style={{ color: "var(--g-text)", fontSize: "1.125rem" }}>Hi, {guestName}</p>}
      <p className="g-subtitle g-mb-3">Choose how you want to talk and how Nova should respond.</p>

      {status === "idle" && (
        <div className="g-toggles g-mb-3">
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--g-text-muted)", marginRight: 4 }}>You:</span>
          <label className={`g-toggle-pill ${inputMode === "voice" ? "active" : ""}`}>
            <input type="radio" name="input" checked={inputMode === "voice"} onChange={() => setInputMode("voice")} />
            Voice
          </label>
          <label className={`g-toggle-pill ${inputMode === "text" ? "active" : ""}`}>
            <input type="radio" name="input" checked={inputMode === "text"} onChange={() => setInputMode("text")} />
            Text
          </label>
          <span style={{ width: 16 }} />
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--g-text-muted)", marginRight: 4 }}>Nova:</span>
          <label className={`g-toggle-pill ${outputMode === "voice" ? "active" : ""}`}>
            <input type="radio" name="output" checked={outputMode === "voice"} onChange={() => setOutputMode("voice")} />
            Voice
          </label>
          <label className={`g-toggle-pill ${outputMode === "text" ? "active" : ""}`}>
            <input type="radio" name="output" checked={outputMode === "text"} onChange={() => setOutputMode("text")} />
            Text
          </label>
        </div>
      )}

      {status === "idle" && (
        <button type="button" className="g-btn g-btn-primary" onClick={() => start()} style={{ padding: "16px 40px", fontSize: "1.125rem" }}>
          Start
        </button>
      )}

      {status === "connecting" && (
        <p className="g-subtitle">Connecting…</p>
      )}

      {status === "connected" && (
        <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 200 }}>
          {(outputMode === "text" || inputMode === "text") && (
            <div className="g-chat-wrap">
              {messages.length === 0 && outputMode === "text" && (
                <p className="g-subtitle" style={{ margin: 0, fontSize: "0.875rem" }}>Send a message below. Nova will reply here.</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`g-chat-msg ${m.role}`}>
                  <span className={`g-chat-bubble ${m.role}`}>{m.text}</span>
                </div>
              ))}
              {streamingText && (
                <div className="g-chat-msg assistant">
                  <span className="g-chat-bubble assistant">{streamingText}</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
          {status === "connected" && inputMode === "text" && (
            <div className="g-chat-input-row">
              <input
                type="text"
                className="g-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendText()}
                placeholder="Type a message…"
              />
              <button type="button" className="g-btn g-btn-primary" onClick={sendText} disabled={!textInput.trim()}>
                Send
              </button>
            </div>
          )}
          {status === "connected" && (inputMode === "voice" || outputMode === "voice") && (
            <p className="g-subtitle" style={{ margin: 0 }}>
              <span className="g-status-dot" />
              {inputMode === "voice" && outputMode === "voice" ? "Connected. Speak now." : "Connected. Speak; replies will appear above."}
            </p>
          )}
          <button type="button" className="g-btn g-btn-secondary g-mt-2" onClick={() => disconnect()} style={{ alignSelf: "center" }}>
            End session
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="g-max-w-wide" style={{ textAlign: "center" }}>
          <p className="g-error-msg g-mb-2">{errorMsg}</p>
          <button type="button" className="g-btn g-btn-primary" onClick={() => { setStatus("idle"); setErrorMsg(""); }}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
