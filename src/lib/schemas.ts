import { z } from "zod";

// Transcription list response: GET /v1/transcriptions
export const TranscriptionSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    duration: z.union([z.number(), z.string()]).nullable().optional(),
    createdAt: z.string().nullable().optional(),
    lang: z.string().nullable().optional(),
    youtubeUrl: z.string().nullable().optional(),
    channelTitle: z.string().nullable().optional(),
    channelHandle: z.string().nullable().optional(),
  })
  .passthrough();

export const TranscriptionListResponseSchema = z
  .object({
    list: z.array(TranscriptionSchema).optional(),
    data: z.array(TranscriptionSchema).optional(),
    transcriptions: z.array(TranscriptionSchema).optional(),
    items: z.array(TranscriptionSchema).optional(),
    results: z.array(TranscriptionSchema).optional(),
    page: z.number().optional(),
    limit: z.number().optional(),
    total: z.number().optional(),
    totalPages: z.number().optional(),
    pagination: z.record(z.string(), z.unknown()).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

// Analysis response: GET /v1/analysis/:id
export const AnalysisResponseSchema = z
  .object({
    analysis: z.record(z.string(), z.unknown()).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    title: z.string().nullable().optional(),
    videoTitle: z.string().nullable().optional(),
    channelTitle: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    duration: z.union([z.number(), z.string()]).nullable().optional(),
    cleanContent: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    transcript: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    lang: z.string().nullable().optional(),
  })
  .passthrough();

// Usage/status response: GET /auth/cli/status
export const StatusResponseSchema = z
  .object({
    email: z.string().optional(),
    plan: z.string().optional(),
    status: z.string().optional(),
    usage: z.record(z.string(), z.number()).optional(),
    limits: z.record(z.string(), z.number()).optional(),
    period: z.string().optional(),
    current_period_end: z.string().nullable().optional(),
    user: z.record(z.string(), z.unknown()).optional(),
    total: z.number().optional(),
  })
  .passthrough();

// Prompts response: GET /v1/prompts
export const PromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const PromptsResponseSchema = z
  .object({
    prompts: z.array(PromptSchema),
  })
  .passthrough();

// Spike creation response: POST /spikes/:id
export const SpikeCreateResponseSchema = z
  .object({
    spikeId: z.string().optional(),
    id: z.string().optional(),
    content: z.string().nullable().optional(),
    markdown: z.string().nullable().optional(),
    isClone: z.boolean().optional(),
    transcriptionId: z.string().optional(),
  })
  .passthrough();

// Workspace list response: GET /v1/workspaces
export const WorkspaceSchema = z
  .object({
    id: z.string().optional(),
    workspaceId: z.string().optional(),
    name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
  })
  .passthrough();

export const WorkspacesResponseSchema = z
  .object({
    workspaces: z.array(WorkspaceSchema).optional(),
    data: z.array(WorkspaceSchema).optional(),
    list: z.array(WorkspaceSchema).optional(),
  })
  .passthrough();

// Add response: GET /v1/add
export const AddResponseSchema = z
  .object({
    id: z.string().optional(),
    transcriptionId: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

// Inferred types for CLI commands
export type Transcription = z.infer<typeof TranscriptionSchema>;
export type TranscriptionListResponse = z.infer<typeof TranscriptionListResponseSchema>;
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type PromptsResponse = z.infer<typeof PromptsResponseSchema>;
export type SpikeCreateResponse = z.infer<typeof SpikeCreateResponseSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspacesResponse = z.infer<typeof WorkspacesResponseSchema>;
export type AddResponse = z.infer<typeof AddResponseSchema>;
