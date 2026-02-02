/**
 * SSE (Server-Sent Events) client library.
 *
 * An async generator that consumes SSE from the API using native fetch
 * with streaming response body. Supports Last-Event-ID for resumption.
 */

export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
}

export interface SSEOptions {
  token: string;
  apiUrl: string;
  lastEventId?: string;
  signal?: AbortSignal;
}

/**
 * Connect to an SSE endpoint and yield parsed events.
 *
 * If the endpoint returns JSON (Content-Type: application/json) instead of
 * an event stream, yields a single synthetic event with type "complete" and
 * the full JSON body as data, then returns.
 */
export async function* streamSSE(
  path: string,
  options: SSEOptions,
): AsyncGenerator<SSEEvent, void, undefined> {
  const url = new URL(path, options.apiUrl);

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    Authorization: `Bearer ${options.token.trim()}`,
  };

  if (options.lastEventId) {
    headers["Last-Event-ID"] = options.lastEventId;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SSE ${response.status}: ${text || response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  // If the server returns JSON instead of SSE, the spike is already complete
  if (contentType.includes("application/json")) {
    const body = await response.text();
    yield { event: "complete", data: body };
    return;
  }

  if (!response.body) {
    throw new Error("SSE: no response body (streaming not supported)");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Current event being parsed
  let currentId: string | undefined;
  let currentEvent: string | undefined;
  let currentData: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush any remaining event
        if (currentData.length > 0) {
          yield {
            id: currentId,
            event: currentEvent,
            data: currentData.join("\n"),
          };
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep incomplete last line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === "") {
          // Empty line = event dispatch
          if (currentData.length > 0) {
            yield {
              id: currentId,
              event: currentEvent,
              data: currentData.join("\n"),
            };
          }
          // Reset for next event
          currentId = undefined;
          currentEvent = undefined;
          currentData = [];
          continue;
        }

        if (line.startsWith(":")) {
          // Comment line (heartbeat), skip
          continue;
        }

        const colonIndex = line.indexOf(":");
        let field: string;
        let value: string;

        if (colonIndex === -1) {
          field = line;
          value = "";
        } else {
          field = line.slice(0, colonIndex);
          // Strip single leading space after colon per SSE spec
          value = line.slice(colonIndex + 1);
          if (value.startsWith(" ")) {
            value = value.slice(1);
          }
        }

        switch (field) {
          case "id":
            currentId = value;
            break;
          case "event":
            currentEvent = value;
            break;
          case "data":
            currentData.push(value);
            break;
          // retry field ignored for now
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
