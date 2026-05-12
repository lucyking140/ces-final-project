import { useState, useRef, useEffect, useCallback } from "react";

const BAUD_RATES = [115200, 57600, 9600];

const BEEP_GAIN = 4.0;

const styles = {
  wrapper: {
    fontFamily: "'Courier New', monospace",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "2rem 1rem",
    maxWidth: "580px",
    margin: "0 auto",
  },
  title: {
    fontSize: "0.95rem",
    fontWeight: "normal",
    letterSpacing: "0.2em",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: "1.5rem",
  },
  panel: {
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    padding: "1.25rem 1.5rem",
    width: "100%",
    marginBottom: "1rem",
  },
  panelLabel: {
    fontSize: "0.68rem",
    letterSpacing: "0.15em",
    color: "#555",
    textTransform: "uppercase",
    marginBottom: "0.85rem",
  },
  controls: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap",
    alignItems: "center",
  },
  btn: {
    background: "#1e1e1e",
    color: "#ccc",
    border: "1px solid #333",
    borderRadius: "5px",
    padding: "0.45rem 1rem",
    fontFamily: "'Courier New', monospace",
    fontSize: "0.8rem",
    cursor: "pointer",
    letterSpacing: "0.05em",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "background 0.15s, border-color 0.15s, color 0.15s",
  },
  btnConnected: {
    borderColor: "#2d6a4f",
    color: "#52b788",
    background: "#0d1f17",
  },
  btnDisabled: {
    opacity: 0.3,
    cursor: "not-allowed",
  },
  select: {
    background: "#1e1e1e",
    color: "#ccc",
    border: "1px solid #333",
    borderRadius: "5px",
    padding: "0.45rem 0.75rem",
    fontFamily: "'Courier New', monospace",
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  dot: (state) => ({
    display: "inline-block",
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background:
      state === "on" ? "#52b788" : state === "beep" ? "#e07a5f" : "#333",
    boxShadow:
      state === "on"
        ? "0 0 6px #52b788"
        : state === "beep"
          ? "0 0 6px #e07a5f"
          : "none",
    flexShrink: 0,
    transition: "background 0.3s, box-shadow 0.3s",
  }),
  uploadLabel: (loaded) => ({
    display: "inline-block",
    background: loaded ? "#0d1f17" : "#1e1e1e",
    color: loaded ? "#52b788" : "#ccc",
    border: loaded ? "1px solid #2d6a4f" : "1px solid #333",
    borderRadius: "5px",
    padding: "0.45rem 1rem",
    fontSize: "0.8rem",
    cursor: "pointer",
    letterSpacing: "0.05em",
    fontFamily: "'Courier New', monospace",
  }),
  log: {
    height: "220px",
    overflowY: "auto",
    fontSize: "0.78rem",
    lineHeight: "1.7",
    color: "#666",
  },
  logLine: {
    rx: { color: "#7a9ccc", padding: "1px 0" },
    beep: { color: "#e07a5f", padding: "1px 0" },
    info: { color: "#888", padding: "1px 0" },
    err: { color: "#c0392b", padding: "1px 0" },
  },
  flash: (active) => ({
    position: "fixed",
    inset: 0,
    background: "rgba(224, 122, 95, 0.07)",
    pointerEvents: "none",
    opacity: active ? 1 : 0,
    transition: "opacity 0.05s",
    zIndex: 9999,
  }),
};

export default function ESP32Monitor() {
  const [connected, setConnected] = useState(false);
  const [dotState, setDotState] = useState("off");
  const [baud, setBaud] = useState(115200);
  const [beepFile, setBeepFile] = useState("");
  const [touchFile, setTouchFile] = useState("");
  const [logLines, setLogLines] = useState([]);
  const [flashing, setFlashing] = useState(false);

  const portRef = useRef(null);
  const readerRef = useRef(null);
  const writerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepBufferRef = useRef(null);
  const touchBufferRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines]);

  const addLog = useCallback((msg, type = "info") => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogLines((prev) => [
      ...prev.slice(-200),
      { ts, msg, type, id: Date.now() + Math.random() },
    ]);
  }, []);

  const sendKey = useCallback(
    async (char) => {
      if (!writerRef.current) return;
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(char));
      addLog(`key sent: '${char}'`, "info");
    },
    [addLog],
  );

  useEffect(() => {
    const handler = (e) => {
      // Ignore modifier-only keys and browser shortcuts
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (!portRef.current) return;
      sendKey(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sendKey]);

  const playSound = useCallback(async (bufferRef) => {
    if (!bufferRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(ctx.destination);
    src.start();
  }, []);

  const playBeep = useCallback(async () => {
    await playSound(beepBufferRef, BEEP_GAIN);
    setFlashing(true);
    setDotState("beep");
    addLog("BEEP — keypress ignored by ESP32", "beep");
    setTimeout(() => {
      setFlashing(false);
      setDotState((prev) =>
        prev === "beep" ? (portRef.current ? "on" : "off") : prev,
      );
    }, 300);
  }, [addLog, playSound]);

  const playTouch = useCallback(async () => {
    await playSound(touchBufferRef);
    addLog("TOUCH — pin 33 capacitive touch triggered", "beep");
  }, [addLog, playSound]);

  const loadAudioFile = useCallback(
    async (file, bufferRef, setFileName) => {
      if (!file) return;
      audioCtxRef.current = audioCtxRef.current || new AudioContext();
      const buf = await file.arrayBuffer();
      bufferRef.current = await audioCtxRef.current.decodeAudioData(buf);
      setFileName(file.name);
      addLog("Audio loaded: " + file.name);
    },
    [addLog],
  );

  const readLoop = useCallback(async () => {
    const decoder = new TextDecoderStream();
    portRef.current.readable.pipeTo(decoder.writable);
    readerRef.current = decoder.readable.getReader();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await readerRef.current.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "BEEP") {
            playBeep();
          } else if (trimmed === "TOUCH") {
            playTouch();
          } else {
            addLog(trimmed, "rx");
          }
        }
      }
    } catch (e) {
      if (portRef.current) addLog("Read error: " + e.message, "err");
    }
  }, [addLog, playBeep, playTouch]);

  const connect = async () => {
    if (!("serial" in navigator)) {
      addLog("Web Serial not supported — use Chrome or Edge.", "err");
      return;
    }
    try {
      const p = await navigator.serial.requestPort();
      await p.open({ baudRate: baud });
      portRef.current = p;
      writerRef.current = p.writable.getWriter();
      setConnected(true);
      setDotState("on");
      addLog(`Connected at ${baud} baud`);
      readLoop();
    } catch (e) {
      addLog("Connection failed: " + e.message, "err");
    }
  };

  const disconnect = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (writerRef.current) {
        await writerRef.current.close();
        writerRef.current = null;
      }
      await portRef.current.close();
    } catch {}
    portRef.current = null;
    setConnected(false);
    setDotState("off");
    addLog("Disconnected");
  };

  return (
    <>
      <div style={styles.flash(flashing)} />
      <div style={styles.wrapper}>
        <h2 style={styles.title}>ESP32 Binary Display Monitor</h2>

        {/* Connection */}
        <div style={styles.panel}>
          <div style={styles.panelLabel}>Connection</div>
          <div style={styles.controls}>
            <button
              style={{
                ...styles.btn,
                ...(connected ? styles.btnConnected : {}),
              }}
              onClick={connected ? disconnect : connect}
            >
              <span style={styles.dot(dotState)} />
              {connected ? "Disconnect" : "Connect"}
            </button>
            <select
              style={styles.select}
              value={baud}
              onChange={(e) => setBaud(Number(e.target.value))}
              disabled={connected}
            >
              {BAUD_RATES.map((r) => (
                <option key={r} value={r}>
                  {r} baud
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Audio */}
        <div style={styles.panel}>
          <div style={styles.panelLabel}>Sounds</div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <div style={styles.controls}>
              <span
                style={{ fontSize: "0.75rem", color: "#555", width: "80px" }}
              >
                Beep
              </span>
              <label style={styles.uploadLabel(!!beepFile)}>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) =>
                    loadAudioFile(e.target.files[0], beepBufferRef, setBeepFile)
                  }
                  style={{ display: "none" }}
                />
                {beepFile ? `✓ ${beepFile}` : "Upload mp3"}
              </label>
              <button
                style={{
                  ...styles.btn,
                  ...(beepFile ? {} : styles.btnDisabled),
                }}
                onClick={playBeep}
                disabled={!beepFile}
              >
                Test
              </button>
            </div>
            <div style={styles.controls}>
              <span
                style={{ fontSize: "0.75rem", color: "#555", width: "80px" }}
              >
                Touch
              </span>
              <label style={styles.uploadLabel(!!touchFile)}>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) =>
                    loadAudioFile(
                      e.target.files[0],
                      touchBufferRef,
                      setTouchFile,
                    )
                  }
                  style={{ display: "none" }}
                />
                {touchFile ? `✓ ${touchFile}` : "Upload mp3"}
              </label>
              <button
                style={{
                  ...styles.btn,
                  ...(touchFile ? {} : styles.btnDisabled),
                }}
                onClick={playTouch}
                disabled={!touchFile}
              >
                Test
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard */}
        <div style={styles.panel}>
          <div style={styles.panelLabel}>Keyboard Input</div>
          <div style={styles.controls}>
            <span
              style={{
                fontSize: "0.8rem",
                color: connected ? "#52b788" : "#555",
              }}
            >
              <span style={styles.dot(connected ? "on" : "off")} />
              {connected
                ? "Keypresses are being sent to ESP32"
                : "Connect to start sending keypresses"}
            </span>
          </div>
        </div>

        {/* Log */}
        <div style={styles.panel}>
          <div style={styles.panelLabel}>Serial Log</div>
          <div style={styles.log}>
            {logLines.map((line) => (
              <div key={line.id} style={styles.logLine[line.type]}>
                {line.ts}&nbsp;&nbsp;{line.msg}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </>
  );
}
