import { Box, Text, useInput } from "ink";
import InkSpinner from "ink-spinner";
import TextInput from "ink-text-input";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { parseResponse } from "../../lib/parseResponse";
import { AddResponseSchema, SpikeCreateResponseSchema } from "../../lib/schemas";
import { extractId, extractStatus, pickValue } from "../../lib/utils";
import { useInputLock } from "../context/InputContext";
import { colors } from "../theme";

type Phase = "input" | "submitting" | "processing" | "creating-spike" | "done" | "error";

const YOUTUBE_URL_RE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch|shorts|live|embed)|youtu\.be\/)/i;

interface PhaseTimer {
  startedAt: number;
  elapsed: number;
  done: boolean;
}

const PHASE_ORDER: Phase[] = ["submitting", "processing", "creating-spike"];
const PHASE_LABELS: Record<string, string> = {
  submitting: "Submitting",
  processing: "Transcribing",
  "creating-spike": "Analyzing",
  done: "Done",
};

interface AddUrlModalProps {
  onDismiss: () => void;
  onSubmitted?: () => void;
}

export function AddUrlModal({ onDismiss, onSubmitted }: AddUrlModalProps): JSX.Element {
  const { setInputActive } = useInputLock();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [transcriptionTitle, setTranscriptionTitle] = useState("");
  const [transcriptionId, setTranscriptionId] = useState<string | null>(null);
  const [phaseTimers, setPhaseTimers] = useState<Record<string, PhaseTimer>>({});
  const phaseTimerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track phase transitions with elapsed time
  const startPhaseTimer = useCallback((phaseName: string) => {
    setPhaseTimers((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (!updated[key].done) {
          updated[key] = { ...updated[key], elapsed: Date.now() - updated[key].startedAt, done: true };
        }
      }
      updated[phaseName] = { startedAt: Date.now(), elapsed: 0, done: false };
      return updated;
    });
  }, []);

  const finishAllTimers = useCallback(() => {
    setPhaseTimers((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (!updated[key].done) {
          updated[key] = { ...updated[key], elapsed: Date.now() - updated[key].startedAt, done: true };
        }
      }
      return updated;
    });
  }, []);

  // Tick active timer every second
  useEffect(() => {
    if (phase === "input" || phase === "done" || phase === "error") {
      if (phaseTimerInterval.current) {
        clearInterval(phaseTimerInterval.current);
        phaseTimerInterval.current = null;
      }
      return;
    }
    phaseTimerInterval.current = setInterval(() => {
      setPhaseTimers((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          if (!updated[key].done) {
            updated[key] = { ...updated[key], elapsed: Date.now() - updated[key].startedAt };
          }
        }
        return updated;
      });
    }, 1000);
    return () => {
      if (phaseTimerInterval.current) {
        clearInterval(phaseTimerInterval.current);
        phaseTimerInterval.current = null;
      }
    };
  }, [phase]);

  // Lock global input when in text input phase
  useEffect(() => {
    setInputActive(phase === "input");
    return () => setInputActive(false);
  }, [phase, setInputActive]);

  const runPipeline = useCallback(
    async (youtubeUrl: string) => {
      try {
        const config = (await readConfig()) ?? {};
        const { token, expired } = resolveToken(config);
        if (!token) {
          setErrorText(
            expired
              ? "Token expired. Run `xevol login` to re-authenticate."
              : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
          );
          setPhase("error");
          return;
        }
        const apiUrl = resolveApiUrl(config);

        // 1. Submit URL
        setPhase("submitting");
        startPhaseTimer("submitting");
        setStatusText("Submitting URL…");

        const rawAddResponse = (await apiFetch("/v1/add", {
          query: { url: youtubeUrl, outputLang: "en" },
          token,
          apiUrl,
        })) as Record<string, unknown>;
        const addResponse = parseResponse(AddResponseSchema, rawAddResponse, "add-url");

        const tid = extractId(addResponse);
        if (!tid) {
          setErrorText("No transcription ID returned from API.");
          setPhase("error");
          return;
        }
        setTranscriptionId(tid);

        const addTitle = pickValue(addResponse, ["title", "videoTitle", "name"]);
        if (addTitle) setTranscriptionTitle(addTitle);

        // Notify parent that URL was submitted — list can refresh
        onSubmitted?.();

        // 2. Poll for completion
        setPhase("processing");
        startPhaseTimer("processing");
        const maxAttempts = 120;
        let finalResponse: Record<string, unknown> | null = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const statusResponse = (await apiFetch(`/v1/status/${tid}`, {
            token,
            apiUrl,
          })) as Record<string, unknown>;

          const currentStatus = extractStatus(statusResponse)?.toLowerCase() ?? "pending";
          setStatusText(`Processing… (${currentStatus})`);

          if (currentStatus.includes("complete")) {
            const titleVal = pickValue(statusResponse, ["title", "videoTitle", "name"]);
            if (titleVal) setTranscriptionTitle(titleVal);
            finalResponse = statusResponse;
            break;
          }

          if (currentStatus.includes("error") || currentStatus.includes("failed")) {
            setErrorText(`Transcription failed: ${currentStatus}`);
            setPhase("error");
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        if (!finalResponse) {
          setErrorText("Timed out waiting for transcription to complete.");
          setPhase("error");
          return;
        }

        // 3. Create spike
        setPhase("creating-spike");
        startPhaseTimer("creating-spike");
        setStatusText("Creating spike…");

        const rawSpikeResponse = (await apiFetch(`/spikes/${tid}`, {
          method: "POST",
          body: { promptId: "formatted", outputLang: "en" },
          token,
          apiUrl,
        })) as Record<string, unknown>;
        parseResponse(SpikeCreateResponseSchema, rawSpikeResponse, "spike-create-add");

        finishAllTimers();
        setPhase("done");
        // Notify parent again on completion
        onSubmitted?.();
      } catch (err) {
        setErrorText((err as Error).message);
        setPhase("error");
      }
    },
    [startPhaseTimer, finishAllTimers, onSubmitted],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!YOUTUBE_URL_RE.test(trimmed)) {
        setErrorText("Not a valid YouTube URL.");
        setPhase("error");
        return;
      }
      void runPipeline(trimmed);
    },
    [runPipeline],
  );

  useInput((input, key) => {
    if (phase === "input") {
      if (key.escape) {
        onDismiss();
        return;
      }
      return;
    }

    if (phase === "error") {
      if (key.escape) {
        onDismiss();
        return;
      }
      if (input.toLowerCase() === "r") {
        setErrorText("");
        setPhase("input");
        return;
      }
      return;
    }

    // During processing phases — Esc dismisses but pipeline continues (fire-and-forget)
    if (phase === "submitting" || phase === "processing" || phase === "creating-spike") {
      if (key.escape) {
        onDismiss();
        return;
      }
      return;
    }

    if (phase === "done") {
      if (key.escape) {
        onDismiss();
        return;
      }
      return;
    }
  });

  // Modal width
  const modalWidth = 60;

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width="100%" height="100%">
      <Box
        flexDirection="column"
        width={modalWidth}
        borderStyle="round"
        borderColor={colors.primary}
        paddingX={2}
        paddingY={1}
      >
        <Text bold color={colors.primary}>
          Add YouTube URL
        </Text>

        {phase === "input" && (
          <Box marginTop={1} flexDirection="row">
            <Text color={colors.secondary}>URL: </Text>
            <TextInput
              value={url}
              onChange={setUrl}
              onSubmit={handleSubmit}
              placeholder="https://youtube.com/watch?v=..."
            />
          </Box>
        )}

        {(phase === "submitting" || phase === "processing" || phase === "creating-spike") && (
          <Box marginTop={1} flexDirection="column">
            {transcriptionId && (
              <Text color={colors.secondary} dimColor>
                ID: {transcriptionId}
              </Text>
            )}
            {transcriptionTitle && <Text color={colors.secondary}>{transcriptionTitle}</Text>}
            <Box marginTop={1} flexDirection="column">
              {PHASE_ORDER.map((p) => {
                const timer = phaseTimers[p];
                const isActive = p === phase;
                const isDone = timer?.done === true;
                const elapsed = timer ? Math.floor(timer.elapsed / 1000) : 0;

                let icon = "◯";
                if (isDone) icon = "✓";

                const label = PHASE_LABELS[p] ?? p;
                const timeStr = timer ? ` (${elapsed}s)` : "";

                if (isActive) {
                  return (
                    <Box key={p} flexDirection="row">
                      <Text color={colors.primary}>
                        <InkSpinner type="dots" /> {label}
                        {timeStr}
                      </Text>
                    </Box>
                  );
                }
                return (
                  <Box key={p} flexDirection="row">
                    <Text color={isDone ? colors.success : colors.secondary}>
                      {icon} {label}
                      {timeStr}
                    </Text>
                  </Box>
                );
              })}
            </Box>
            <Box marginTop={1}>
              <Text color={colors.secondary} dimColor>
                Esc to dismiss (continues in background)
              </Text>
            </Box>
          </Box>
        )}

        {phase === "done" && (
          <Box marginTop={1} flexDirection="column">
            {transcriptionTitle && <Text color={colors.secondary}>{transcriptionTitle}</Text>}
            <Box marginTop={1}>
              <Text color={colors.success}>✔ Complete</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={colors.secondary} dimColor>
                Press Esc to close
              </Text>
            </Box>
          </Box>
        )}

        {phase === "error" && (
          <Box marginTop={1} flexDirection="column">
            <Text color={colors.error}>Error: {errorText}</Text>
            <Box marginTop={1}>
              <Text color={colors.secondary}>r to retry · Esc to close</Text>
            </Box>
          </Box>
        )}

        {phase === "input" && (
          <Box marginTop={1}>
            <Text color={colors.secondary} dimColor>
              Enter to submit · Esc to cancel
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
