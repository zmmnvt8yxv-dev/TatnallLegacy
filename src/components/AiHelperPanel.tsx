import { useEffect, useMemo, useState } from "react";
import { useAllSeasonsData } from "../hooks/useAllSeasonsData";
import type { AiHelperResponse } from "../lib/aiHelper";
import { runAiHelperQuery } from "../lib/aiHelper";

const STORAGE_KEY = "tatnall-ai-helper-key";

const getStoredKey = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
};

const setStoredKey = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
};

const SUPPORTED_PROMPTS = [
  "show player history for NAME",
  "best weeks for NAME",
  "team record in YEAR for TEAM",
  "biggest blowouts in YEAR",
  "head-to-head between TEAM A and TEAM B",
];

const buildNarrativeSummary = async (result: AiHelperResponse, apiKey: string) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You summarize structured results. Use only the provided data, never add facts. If status is no_data or unsupported, respond with a short refusal that includes 'No data found'.",
        },
        {
          role: "user",
          content: `Summarize this structured result:\n${JSON.stringify(result)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
};

export function AiHelperPanel() {
  const { status, seasons, loadAllSeasons, error } = useAllSeasonsData();
  const [question, setQuestion] = useState("");
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [result, setResult] = useState<AiHelperResponse | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    setApiKey(getStoredKey());
  }, []);

  useEffect(() => {
    if (pendingQuery && status === "ready") {
      const nextResult = runAiHelperQuery(seasons, pendingQuery);
      setResult(nextResult);
      setPendingQuery(null);
    }
  }, [pendingQuery, seasons, status]);

  useEffect(() => {
    if (!result || result.status !== "ok" || !apiKey) {
      return;
    }
    let isActive = true;
    setIsSummarizing(true);
    setNarrative(null);
    setNarrativeError(null);

    buildNarrativeSummary(result, apiKey)
      .then((summary) => {
        if (!isActive) {
          return;
        }
        setNarrative(summary.trim() || null);
      })
      .catch((errorValue) => {
        if (!isActive) {
          return;
        }
        setNarrativeError(errorValue instanceof Error ? errorValue.message : "Narrative summary failed.");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsSummarizing(false);
      });

    return () => {
      isActive = false;
    };
  }, [apiKey, result]);

  const handleSubmit = () => {
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }
    setNarrative(null);
    setNarrativeError(null);

    if (status === "idle") {
      loadAllSeasons();
      setPendingQuery(trimmed);
      return;
    }

    if (status === "loading") {
      setPendingQuery(trimmed);
      return;
    }

    if (status === "error") {
      setResult({
        status: "no_data",
        intent: "unknown",
        query: trimmed,
        citations: [],
        message: error ?? "No data found.",
      });
      return;
    }

    setResult(runAiHelperQuery(seasons, trimmed));
  };

  const jsonResult = useMemo(() => {
    if (!result) {
      return "";
    }
    return JSON.stringify(result, null, 2);
  }, [result]);

  return (
    <div className="summary-ai">
      <div className="summary-ai__header">
        <div>
          <p className="section-heading">Ask the league AI</p>
          <p className="section-caption">
            Grounded answers only. We search your league data and refuse to guess.
          </p>
        </div>
        <div className="summary-ai__settings">
          <label className="summary-ai__label" htmlFor="ai-helper-key">
            Optional API key for narrative summary
          </label>
          <input
            id="ai-helper-key"
            className="input summary-ai__input"
            type="password"
            value={apiKey}
            placeholder="Paste API key"
            onChange={(event) => {
              const value = event.target.value;
              setApiKey(value);
              setStoredKey(value.trim());
            }}
          />
          <p className="summary-ai__hint">Stored locally in your browser. Leave blank for offline mode.</p>
        </div>
      </div>
      <div className="summary-ai__form">
        <input
          className="input summary-ai__input"
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about the season..."
          aria-label="Ask the league AI about the full season"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSubmit();
            }
          }}
        />
        <button type="button" className="btn btn-primary" onClick={handleSubmit}>
          Ask AI
        </button>
      </div>
      <p className="summary-ai__hint">Example: “Who had the biggest comeback win this season?”</p>

      <div className="ai-helper__status">
        {status === "loading" ? <p className="text-xs text-muted">Loading league data…</p> : null}
        {status === "error" ? (
          <p className="text-xs text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
        ) : null}
      </div>

      <div className="ai-helper__results">
        {result ? (
          <>
            {result.status === "ok" ? (
              <div className="ai-helper__card">
                <h3 className="ai-helper__title">Structured results</h3>
                <pre className="ai-helper__code">{jsonResult}</pre>
              </div>
            ) : (
              <div className="ai-helper__card">
                <h3 className="ai-helper__title">No data found</h3>
                <p className="text-sm text-muted">{result.message ?? "No data found."}</p>
                {result.status === "unsupported" ? (
                  <ul className="ai-helper__list">
                    {SUPPORTED_PROMPTS.map((prompt) => (
                      <li key={prompt} className="text-xs text-muted">
                        {prompt}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}

            {apiKey ? (
              <div className="ai-helper__card">
                <h3 className="ai-helper__title">Narrative summary</h3>
                {isSummarizing ? (
                  <p className="text-sm text-muted">Generating summary…</p>
                ) : narrative ? (
                  <p className="text-sm text-foreground">{narrative}</p>
                ) : (
                  <p className="text-sm text-muted">
                    {narrativeError ?? "Narrative summary unavailable."}
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="ai-helper__card">
            <h3 className="ai-helper__title">Structured results</h3>
            <p className="text-sm text-muted">Ask a question to see grounded answers.</p>
          </div>
        )}
      </div>
    </div>
  );
}
