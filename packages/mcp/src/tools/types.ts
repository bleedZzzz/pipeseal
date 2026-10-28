import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type McpErrorCategory =
  | "INVALID_INPUT"
  | "PATH_SECURITY_ERROR"
  | "CONFIG_ERROR"
  | "VERIFICATION_FAILED"
  | "EXECUTION_ERROR"
  | "TIMEOUT_ERROR"
  | "SECURITY_ERROR";

export interface McpToolSuccessPayload<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface McpToolErrorPayload {
  success: false;
  error: {
    category: McpErrorCategory;
    message: string;
    details?: unknown;
  };
}

export type McpToolPayload<T = unknown> =
  McpToolSuccessPayload<T> | McpToolErrorPayload;

export type McpCallToolResult = CallToolResult;

/**
 * Creates a successful MCP response with both concise human-readable text
 * and formatted machine-readable JSON structure.
 */
export function formatSuccessResponse<T>(
  summaryMessage: string,
  data: T,
): CallToolResult {
  const payload: McpToolSuccessPayload<T> = {
    success: true,
    message: summaryMessage,
    data,
  };

  return {
    content: [
      {
        type: "text",
        text: `${summaryMessage}\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    isError: false,
  };
}

/**
 * Creates an error MCP response categorized by failure domain.
 */
export function formatErrorResponse(
  category: McpErrorCategory,
  message: string,
  details?: unknown,
): CallToolResult {
  const payload: McpToolErrorPayload = {
    success: false,
    error: {
      category,
      message,
      details,
    },
  };

  return {
    content: [
      {
        type: "text",
        text: `[${category}] ${message}\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    isError: true,
  };
}
