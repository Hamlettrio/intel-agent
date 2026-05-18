import { useState, useRef, useEffect } from "react";

const GEMINI_MODEL = "gemini-2.0-flash";

const SYSTEM_PROMPT = `You are an elite competitive intelligence analyst agent with web search capability.

Your job: given a company or topic, autonomously research and produce a structured intelligence report.

You MUST search the web multiple times to gather:
1. Latest news, funding, products, competitors
2. Market position, SWOT signals, key metrics
3. Leadership, strategy, controversies

After searching, return ONLY a valid JSON object with this exact structure (no prose, no markdown, no backticks):
{
  "company": "string",
  "generated": "ISO date string",
  "executive_summary": "2-3 sentence overview",
  "key_findings": ["finding 1", "finding 2", "finding 3", "finding 4", "finding 5"],
  "swot": {
    "strengths": ["s1", "s2", "s3"],
    "weaknesses": ["w1", "w2"],
    "opportunities": ["o1", "o2"],
    "threats": ["t1", "t2"]
  },
  "market_position": {
    "description": "paragraph about market standing",
    "competitors": ["comp1", "comp2", "comp3"],
    "market_share_estimate": "string e.g. ~15%"
  },
  "recent_developments": [
    {"date": "Month Year", "event": "description"},
    {"date": "Month Year", "event": "description"},
    {"date": "Month Year", "event": "description"}
  ],
  "risk_rating": "LOW | MEDIUM | HIGH | CRITICAL",
  "analyst_verdict": "1-2 sentence final take",
  "sources_searched": ["topic1", "topic2", "topic3"]
}`;

export default function IntelAgent() {
  const [query, setQuery] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [phase, setPhase] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (type, text) => {
    setLogs((prev) => [...prev, { type, text, ts: Date.now() }]);
  };

  const runAgent = async () => {
    if (!query.trim() || !apiKey.trim() || phase === "running") return;
    setPhase("running");
    setLogs([]);
    setReport(null);
    setError("");

    addLog("init", `Initializing intelligence operation on: ${query}`);
    addLog("info", "Deploying Gemini agentic search loop...");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const tools = [
      {
        google_search: {},
      },
    ];

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nConduct a full competitive intelligence analysis on: "${query}". Search thoroughly, then return ONLY the JSON report.`,
          },
        ],
      },
    ];

    let iterations = 0;
    const MAX_ITER = 6;

    try {
      while (iterations < MAX_ITER) {
        iterations++;
        addLog("loop", `Agent iteration ${iterations}/${MAX_ITER}`);

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            tools,
            generation_config: {
              temperature: 0.3,
              max_output_tokens: 4000,
            },
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || "Gemini API error");
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        if (!candidate) throw new Error("No response from Gemini");

        const parts = candidate.content?.parts || [];
        let finalText = "";
        let didSearch = false;

        for (const part of parts) {
          if (part.text) {
            finalText += part.text;
          }
          if (part.executableCode || part.codeExecutionResult) {
            addLog("search", "Gemini executing search...");
            didSearch = true;
          }
        }

        // Check grounding metadata for search queries
        const groundingMeta = candidate.groundingMetadata;
        if (groundingMeta?.webSearchQueries?.length) {
          for (const q of groundingMeta.webSearchQueries) {
            addLog("search", `Searching: "${q}"`);
          }
          didSearch = true;
        }

        // Push assistant response to history
        contents.push({
          role: "model",
          parts: parts,
        });

        const finishReason = candidate.finishReason;

        if (finalText && finalText.trim().length > 50) {
          addLog("done", "Analysis complete. Parsing intelligence report...");

          let parsed = null;
          const jsonMatch = finalText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              try {
                const cleaned = jsonMatch[0].replace(/```json|```/g, "").trim();
                parsed = JSON.parse(cleaned);
              } catch {
                throw new Error("Failed to parse report JSON from Gemini response");
              }
            }
          }

          if (parsed) {
            setReport(parsed);
            setPhase("done");
            return;
          }

          // If text exists but no JSON yet, ask to finalize
          if (didSearch || finishReason === "STOP") {
            contents.push({
              role: "user",
              parts: [{ text: "Now output ONLY the final JSON report based on your research. No prose, no markdown, just the raw JSON object." }],
            });
            continue;
          }
        }

        if (finishReason === "STOP" && !finalText) {
          contents.push({
            role: "user",
            parts: [{ text: "Output the final JSON intelligence report now." }],
          });
          continue;
        }

        if (!didSearch && !finalText) {
          throw new Error("Gemini returned an empty response");
        }
      }

      throw new Error("Agent reached iteration limit without producing a report");
    } catch (e) {
      setError(e.message);
      setPhase("error");
      addLog("error", `Operation failed: ${e.message}`);
    }
  };

  const riskColor = {
    LOW: "#1D9E75",
    MEDIUM: "#BA7517",
    HIGH: "#D85A30",
    CRITICAL: "#E24B4A",
  };

  const swotColors = {
    strengths: { bg: "#E1F5EE", label: "Strengths" },
    weaknesses: { bg: "#FAECE7", label: "Weaknesses" },
    opportunities: { bg: "#E6F1FB", label: "Opportunities" },
    threats: { bg: "#FCEBEB", label: "Threats" },
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: "#0a0c10", minHeight: "100vh", color: "#c8d6e5", padding: 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #2a3f5c; border-radius: 2px; }
        .amber { color: #EF9F27; }
        .dim { color: #5a7a99; }
        .tag { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #EF9F27; animation: pulse 1.5s ease-in-out infinite; display: inline-block; margin-right: 8px; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
        .log-entry { animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .run-btn { background: #EF9F27; color: #0a0c10; border: none; padding: 10px 24px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; letter-spacing: 0.06em; text-transform: uppercase; transition: all 0.15s; border-radius: 3px; }
        .run-btn:hover:not(:disabled) { background: #FAC775; }
        .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .text-input { background: #0d1117; border: 1px solid #1e2d3d; color: #c8d6e5; padding: 10px 14px; font-family: inherit; font-size: 14px; outline: none; border-radius: 3px; transition: border-color 0.2s; width: 100%; }
        .text-input:focus { border-color: #EF9F27; }
        .text-input::placeholder { color: #2a3f5c; }
        .report-card { background: #0d1117; border: 1px solid #1a2535; border-radius: 4px; padding: 20px; margin-bottom: 16px; }
        .section-header { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #2a4a6a; margin-bottom: 12px; border-bottom: 1px solid #111d2a; padding-bottom: 6px; }
        .finding-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #0d1620; }
        .finding-row:last-child { border-bottom: none; }
        .dev-row { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #0d1620; }
        .dev-row:last-child { border-bottom: none; }
        .swot-card { border-radius: 4px; padding: 14px; }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#2a4a6a", marginBottom: 6 }}>
            ◈ GEMINI-POWERED INTELLIGENCE PLATFORM
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#dce8f5", margin: 0, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            Competitive Intelligence <span className="amber">Agent</span>
          </h1>
          <p style={{ fontSize: 13, color: "#3a5a7a", marginTop: 6, marginBottom: 0 }}>
            Gemini 2.0 Flash · Autonomous web search · Structured dossier
          </p>
        </div>

        {/* API Key input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "#2a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Gemini API Key
          </label>
          <input
            className="text-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
          />
        </div>

        {/* Query input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: "#2a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Target Company / Topic
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className="text-input"
              style={{ flex: 1 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAgent()}
              placeholder="e.g. OpenAI, Tesla, Stripe, Notion..."
              disabled={phase === "running"}
            />
            <button className="run-btn" onClick={runAgent} disabled={phase === "running" || !query.trim() || !apiKey.trim()}>
              {phase === "running" ? "Running..." : "▶ Deploy"}
            </button>
          </div>
        </div>

        {/* Agent Log */}
        {logs.length > 0 && (
          <div className="report-card" style={{ marginBottom: 20 }}>
            <div className="section-header">
              {phase === "running" && <span className="pulse-dot" />}
              Agent Activity Log
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 12, lineHeight: 1.8 }}>
              {logs.map((log, i) => (
                <div key={i} className="log-entry" style={{ display: "flex", gap: 10 }}>
                  <span className="dim" style={{ minWidth: 60, fontSize: 10 }}>
                    {new Date(log.ts).toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span style={{ color: log.type === "search" ? "#EF9F27" : log.type === "done" ? "#1D9E75" : log.type === "error" ? "#E24B4A" : log.type === "loop" ? "#378ADD" : "#5a7a99" }}>
                    {log.type === "search" ? "⌕" : log.type === "done" ? "✓" : log.type === "error" ? "✗" : log.type === "loop" ? "↻" : "›"}
                  </span>
                  <span style={{ color: log.type === "error" ? "#E24B4A" : "#8aaccc" }}>{log.text}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div style={{ background: "#1a0a0a", border: "1px solid #3a1515", borderRadius: 4, padding: 16, marginBottom: 20, color: "#E24B4A", fontSize: 13 }}>
            ✗ {error}
          </div>
        )}

        {/* Report */}
        {report && (
          <div>
            {/* Header */}
            <div style={{ background: "#0d1520", border: "1px solid #1a3050", borderRadius: 4, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2a5a8a", marginBottom: 6 }}>INTELLIGENCE DOSSIER</div>
                  <h2 style={{ margin: 0, fontSize: 22, color: "#dce8f5", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}>{report.company}</h2>
                  <div style={{ fontSize: 11, color: "#2a4a6a", marginTop: 4 }}>{report.generated || new Date().toISOString().split("T")[0]}</div>
                </div>
                <div style={{ background: (riskColor[report.risk_rating] || "#888") + "22", border: `1px solid ${(riskColor[report.risk_rating] || "#888")}44`, color: riskColor[report.risk_rating] || "#888", padding: "6px 14px", borderRadius: 3, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  RISK: {report.risk_rating}
                </div>
              </div>
              <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13, color: "#7a9fc0", lineHeight: 1.7, borderTop: "1px solid #1a2535", paddingTop: 14 }}>
                {report.executive_summary}
              </p>
            </div>

            {/* Key Findings */}
            <div className="report-card">
              <div className="section-header">Key Findings</div>
              {(report.key_findings || []).map((f, i) => (
                <div key={i} className="finding-row">
                  <span className="amber" style={{ fontWeight: 600, minWidth: 24, fontSize: 12 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontSize: 13, color: "#a0bccc", lineHeight: 1.6 }}>{f}</span>
                </div>
              ))}
            </div>

            {/* SWOT */}
            <div className="report-card">
              <div className="section-header">SWOT Analysis</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {Object.entries(swotColors).map(([key, style]) => (
                  <div key={key} className="swot-card" style={{ background: style.bg + "18", border: `1px solid ${style.bg}40` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: style.bg, marginBottom: 8 }}>{style.label}</div>
                    <ul style={{ margin: 0, paddingLeft: 14 }}>
                      {(report.swot?.[key] || []).map((item, i) => (
                        <li key={i} style={{ fontSize: 12, color: "#8aaccc", lineHeight: 1.6, marginBottom: 3 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Market Position */}
            <div className="report-card">
              <div className="section-header">Market Position</div>
              <p style={{ fontSize: 13, color: "#8aaccc", lineHeight: 1.7, marginTop: 0, marginBottom: 14 }}>{report.market_position?.description}</p>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 10, color: "#2a4a6a", textTransform: "uppercase", letterSpacing: "0.1em" }}>Est. Share</span>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#EF9F27", marginTop: 2 }}>{report.market_position?.market_share_estimate}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, color: "#2a4a6a", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Competitors</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(report.market_position?.competitors || []).map((c, i) => (
                      <span key={i} className="tag" style={{ background: "#111d2a", color: "#378ADD", border: "1px solid #1a3050" }}>{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Developments */}
            <div className="report-card">
              <div className="section-header">Recent Developments</div>
              {(report.recent_developments || []).map((d, i) => (
                <div key={i} className="dev-row">
                  <span style={{ fontSize: 11, color: "#EF9F27", minWidth: 80, paddingTop: 2 }}>{d.date}</span>
                  <span style={{ fontSize: 13, color: "#8aaccc", lineHeight: 1.6 }}>{d.event}</span>
                </div>
              ))}
            </div>

            {/* Verdict */}
            <div style={{ background: "#0a1520", border: "1px solid #1a3050", borderLeft: "3px solid #EF9F27", borderRadius: "0 4px 4px 0", padding: 18, marginBottom: 16 }}>
              <div className="section-header" style={{ marginBottom: 8 }}>Analyst Verdict</div>
              <p style={{ margin: 0, fontSize: 14, color: "#c8d6e5", lineHeight: 1.7, fontStyle: "italic" }}>"{report.analyst_verdict}"</p>
            </div>

            {/* Sources */}
            <div style={{ fontSize: 11, color: "#1e3a55", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span>Searches conducted:</span>
              {(report.sources_searched || []).map((s, i) => (
                <span key={i} className="tag" style={{ background: "#0d1520", color: "#1e3a55", border: "1px solid #111d2a" }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#1a2d3d" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⌕</div>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Enter a company or topic to begin intelligence gathering</div>
          </div>
        )}
      </div>
    </div>
  );
}
