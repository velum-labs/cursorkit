import type { ServerResponse } from "node:http";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { encodeEndStream, encodeEnvelope } from "../connectEnvelope.js";
import {
  AgentClientMessageSchema,
  AgentRunRequestSchema,
  AgentServerMessageSchema,
  type RequestContext,
  type AgentRunRequest,
  type SelectedContext,
  type UserMessage,
  InteractionUpdateSchema,
  TextDeltaUpdateSchema,
  TurnEndedUpdateSchema,
} from "../gen/agent/v1/agent_pb.js";
import type { Logger } from "../logger.js";
import type { ModelRegistry, RegisteredModel } from "../models/registry.js";
import type { ChatMessage, OpenAIStreamOptions } from "../providers/openai.js";

export interface LocalAgentRunDecision {
  model: RegisteredModel;
  messages: ChatMessage[];
  diagnostics: AgentRunDiagnostics;
}

export interface AgentRunDiagnostics {
  modelId: string;
  promptLength: number;
  customSystemPromptLength: number;
  selectedContext: {
    extraContext: number;
    extraContextEntries: number;
    files: number;
    codeSelections: number;
    terminals: number;
    terminalSelections: number;
    folders: number;
    externalLinks: number;
    cursorRules: number;
    cursorCommands: number;
    documentations: number;
    uiElements: number;
    consoleLogs: number;
    gitCommits: number;
    pastChats: number;
    pullRequests: number;
    selectedSkills: number;
    browsers: number;
    documents: number;
  };
  promptContextNodes: number;
  inlinePromptContextNodes: number;
  inlinePromptContextCharacters: number;
  mcpToolCount: number;
  mcpToolNames: string[];
  hasMcpFileSystemOptions: boolean;
  hasSkillOptions: boolean;
  excludeWorkspaceContext: boolean;
  preFetchedBlobCount: number;
  injectedContextMessages: number;
  requestContext?: {
    rules: number;
    tools: number;
    fileContents: number;
    gitRepos: number;
    projectLayouts: number;
    agentSkills: number;
  };
}

const MAX_CONTEXT_MESSAGE_CHARS = 120_000;
const MAX_CONTEXT_ITEM_CHARS = 20_000;
const MAX_TOOL_NAMES = 50;

export function getLocalAgentRunDecision(
  payload: Buffer,
  models: ModelRegistry,
): LocalAgentRunDecision | undefined {
  const request = fromBinary(AgentRunRequestSchema, payload);
  return getLocalAgentRunDecisionFromRequest(request, models);
}

export function getLocalAgentRunDecisionFromClientMessage(
  payload: Uint8Array,
  models: ModelRegistry,
): LocalAgentRunDecision | undefined {
  const message = fromBinary(AgentClientMessageSchema, payload);
  if (message.runRequest === undefined) {
    return undefined;
  }
  return getLocalAgentRunDecisionFromRequest(message.runRequest, models);
}

export function describeAgentRunPayload(payload: Uint8Array): string[] {
  const descriptions: string[] = [];
  try {
    const message = fromBinary(AgentClientMessageSchema, payload);
    descriptions.push(`client:${describeAgentRunRequest(message.runRequest)}`);
  } catch (error) {
    descriptions.push(`client:error:${errorMessage(error)}`);
  }
  try {
    descriptions.push(
      `run:${describeAgentRunRequest(
        fromBinary(AgentRunRequestSchema, payload),
      )}`,
    );
  } catch (error) {
    descriptions.push(`run:error:${errorMessage(error)}`);
  }
  return descriptions;
}

export function withNativeRequestContext(
  decision: LocalAgentRunDecision,
  requestContext: RequestContext,
): LocalAgentRunDecision {
  const contextText = nativeRequestContextToText(requestContext);
  if (contextText === undefined) {
    return decision;
  }
  const messages = [...decision.messages];
  const finalUserMessage = messages.pop();
  messages.push({
    role: "system",
    content: `Cursor native request context\n\n${contextText}`,
  });
  if (finalUserMessage !== undefined) {
    messages.push(finalUserMessage);
  }
  return {
    ...decision,
    messages,
    diagnostics: {
      ...decision.diagnostics,
      requestContext: summarizeNativeRequestContext(requestContext),
      injectedContextMessages: decision.diagnostics.injectedContextMessages + 1,
    },
  };
}

function getLocalAgentRunDecisionFromRequest(
  request: AgentRunRequest,
  models: ModelRegistry,
): LocalAgentRunDecision | undefined {
  const modelId =
    request.requestedModel?.modelId || request.modelDetails?.modelId;
  if (modelId === undefined || modelId.length === 0) {
    return undefined;
  }

  const model = models.get(modelId);
  if (model === undefined) {
    return undefined;
  }
  const userMessage = request.action?.userMessageAction?.userMessage;
  const diagnostics = buildAgentRunDiagnostics(request, modelId);
  const contextMessages = buildAgentContextMessages(request, userMessage);
  diagnostics.injectedContextMessages = contextMessages.length;

  return {
    model,
    messages: [
      ...contextMessages,
      {
        role: "user",
        content: userMessage?.text ?? "",
      },
    ],
    diagnostics,
  };
}

function describeAgentRunRequest(request: AgentRunRequest | undefined): string {
  if (request === undefined) {
    return "none";
  }
  const modelId =
    request.requestedModel?.modelId || request.modelDetails?.modelId || "none";
  const promptLength =
    request.action?.userMessageAction?.userMessage?.text.length ?? 0;
  const diagnostics = buildAgentRunDiagnostics(request, modelId);
  return `model=${modelId},promptLength=${promptLength},contextMessages=${diagnostics.injectedContextMessages},mcpTools=${diagnostics.mcpToolCount},promptContextNodes=${diagnostics.promptContextNodes}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function writeLocalAgentRunResponse(
  response: ServerResponse,
  decision: LocalAgentRunDecision,
  logger: Logger,
  options: OpenAIStreamOptions = {},
): Promise<void> {
  response.statusCode = 200;
  if (!response.headersSent) {
    response.setHeader("content-type", "application/connect+proto");
  }

  let outputCharacters = 0;
  try {
    for await (const text of decision.model.provider.streamCompletion(
      decision.messages,
      options,
    )) {
      outputCharacters += text.length;
      response.write(
        encodeEnvelope(
          toBinary(
            AgentServerMessageSchema,
            create(AgentServerMessageSchema, {
              interactionUpdate: create(InteractionUpdateSchema, {
                textDelta: create(TextDeltaUpdateSchema, { text }),
              }),
            }),
          ),
        ),
      );
    }

    response.write(
      encodeEnvelope(
        toBinary(
          AgentServerMessageSchema,
          create(AgentServerMessageSchema, {
            interactionUpdate: create(InteractionUpdateSchema, {
              turnEnded: create(TurnEndedUpdateSchema, {
                outputTokens: BigInt(Math.ceil(outputCharacters / 4)),
              }),
            }),
          }),
        ),
      ),
    );
    response.end(encodeEndStream());
    logger.info("served local agent run", { model: decision.model.id });
    logger.info("local agent run diagnostics", { ...decision.diagnostics });
  } catch (error) {
    logger.error("local agent run failed", {
      model: decision.model.id,
      error: error instanceof Error ? error.message : String(error),
    });
    endLocalAgentRunFailure(response);
  }
}

function endLocalAgentRunFailure(response: ServerResponse): void {
  if (!response.headersSent) {
    response.statusCode = 200;
    response.setHeader("content-type", "application/connect+proto");
  }
  response.end(encodeEndStream({ error: "local agent run failed" }));
}

export function buildAgentRunDiagnostics(
  request: AgentRunRequest,
  modelId = request.requestedModel?.modelId ||
    request.modelDetails?.modelId ||
    "unknown",
): AgentRunDiagnostics {
  const userMessage = request.action?.userMessageAction?.userMessage;
  const selectedContext = userMessage?.selectedContext;
  const promptContextNodes =
    request.conversationState?.tokenDetails?.promptContextUsageTree?.nodes ??
    [];
  const inlinePromptContextNodes = promptContextNodes.filter(
    (node) => node.inlineContent !== undefined && node.inlineContent.length > 0,
  );
  const mcpToolNames =
    request.mcpTools?.mcpTools
      .map((tool) => tool.name || tool.toolName)
      .filter((name) => name.length > 0)
      .slice(0, MAX_TOOL_NAMES) ?? [];

  return {
    modelId,
    promptLength: userMessage?.text.length ?? 0,
    customSystemPromptLength: request.customSystemPrompt?.length ?? 0,
    selectedContext: summarizeSelectedContext(selectedContext),
    promptContextNodes: promptContextNodes.length,
    inlinePromptContextNodes: inlinePromptContextNodes.length,
    inlinePromptContextCharacters: inlinePromptContextNodes.reduce(
      (sum, node) => sum + (node.inlineContent?.length ?? 0),
      0,
    ),
    mcpToolCount: request.mcpTools?.mcpTools.length ?? 0,
    mcpToolNames,
    hasMcpFileSystemOptions: request.mcpFileSystemOptions !== undefined,
    hasSkillOptions: request.skillOptions !== undefined,
    excludeWorkspaceContext: request.excludeWorkspaceContext === true,
    preFetchedBlobCount: request.preFetchedBlobs.length,
    injectedContextMessages: 0,
  };
}

function buildAgentContextMessages(
  request: AgentRunRequest,
  userMessage: UserMessage | undefined,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  pushContextMessage(
    messages,
    "Cursor custom system prompt",
    request.customSystemPrompt,
  );
  pushContextMessage(
    messages,
    "Cursor subagent system reminder",
    userMessage?.subagentSystemReminder,
  );
  for (const hook of userMessage?.hookAdditionalContexts ?? []) {
    pushContextMessage(
      messages,
      `Cursor hook context: ${hook.hookEventName}`,
      hook.content,
    );
  }

  const selectedContextText = selectedContextToText(
    userMessage?.selectedContext,
  );
  pushContextMessage(messages, "Cursor selected context", selectedContextText);

  const promptContextText = promptContextToText(request);
  pushContextMessage(messages, "Cursor prompt context", promptContextText);

  const toolText = mcpToolsToText(request);
  pushContextMessage(messages, "Cursor available MCP tools", toolText);
  return messages;
}

function summarizeSelectedContext(
  context: SelectedContext | undefined,
): AgentRunDiagnostics["selectedContext"] {
  return {
    extraContext: context?.extraContext.length ?? 0,
    extraContextEntries: context?.extraContextEntries.length ?? 0,
    files: context?.files.length ?? 0,
    codeSelections: context?.codeSelections.length ?? 0,
    terminals: context?.terminals.length ?? 0,
    terminalSelections: context?.terminalSelections.length ?? 0,
    folders: context?.folders.length ?? 0,
    externalLinks: context?.externalLinks.length ?? 0,
    cursorRules: context?.cursorRules.length ?? 0,
    cursorCommands: context?.cursorCommands.length ?? 0,
    documentations: context?.documentations.length ?? 0,
    uiElements: context?.uiElements.length ?? 0,
    consoleLogs: context?.consoleLogs.length ?? 0,
    gitCommits: context?.gitCommits.length ?? 0,
    pastChats: context?.pastChats.length ?? 0,
    pullRequests: context?.selectedPullRequests.length ?? 0,
    selectedSkills: context?.selectedSkills.length ?? 0,
    browsers: context?.selectedBrowsers.length ?? 0,
    documents: context?.selectedDocuments.length ?? 0,
  };
}

function selectedContextToText(
  context: SelectedContext | undefined,
): string | undefined {
  if (context === undefined) {
    return undefined;
  }
  const sections: string[] = [];
  for (const item of context.extraContext) {
    appendSection(sections, "Extra context", item);
  }
  for (const item of context.extraContextEntries) {
    appendSection(sections, "Extra context entry", item.data);
  }
  for (const file of context.files) {
    appendSection(
      sections,
      `Selected file: ${file.relativePath ?? file.path}`,
      file.content,
    );
  }
  for (const selection of context.codeSelections) {
    appendSection(
      sections,
      `Selected code: ${selection.relativePath ?? selection.path}`,
      selection.content,
    );
  }
  for (const terminal of context.terminals) {
    appendSection(
      sections,
      `Selected terminal: ${terminal.title ?? terminal.path ?? "terminal"}`,
      terminal.content,
    );
  }
  for (const selection of context.terminalSelections) {
    appendSection(
      sections,
      `Selected terminal selection: ${selection.title ?? "terminal"}`,
      selection.content,
    );
  }
  for (const rule of context.cursorRules) {
    appendSection(
      sections,
      `Cursor rule: ${rule.rule?.fullPath ?? "unknown"}`,
      rule.rule?.content ?? "",
    );
  }
  for (const command of context.cursorCommands) {
    appendSection(sections, `Cursor command: ${command.name}`, command.content);
  }
  for (const uiElement of context.uiElements) {
    appendSection(
      sections,
      `Selected UI element: ${uiElement.component ?? uiElement.element}`,
      [uiElement.textContent, uiElement.extra].filter(Boolean).join("\n"),
    );
  }
  for (const log of context.consoleLogs) {
    appendSection(
      sections,
      `Selected console log: ${log.level}`,
      [log.message, log.objectDataJson].filter(Boolean).join("\n"),
    );
  }
  for (const commit of context.gitCommits) {
    appendSection(
      sections,
      `Selected git commit: ${commit.sha}`,
      [commit.message, commit.description, commit.diff]
        .filter((value) => value !== undefined && value.length > 0)
        .join("\n"),
    );
  }
  for (const pr of context.selectedPullRequests) {
    appendSection(
      sections,
      `Selected pull request: ${pr.url}`,
      [pr.title, pr.description, pr.summaryJson]
        .filter((value) => value !== undefined && value.length > 0)
        .join("\n"),
    );
  }
  for (const skill of context.selectedSkills) {
    appendSection(
      sections,
      `Selected skill: ${skill.fullPath}`,
      [skill.description, skill.content].filter(Boolean).join("\n"),
    );
  }
  for (const browser of context.selectedBrowsers) {
    appendSection(
      sections,
      `Selected browser: ${browser.pageTitle ?? browser.url}`,
      browser.url,
    );
  }
  return joinBounded(sections, MAX_CONTEXT_MESSAGE_CHARS);
}

function promptContextToText(request: AgentRunRequest): string | undefined {
  const nodes =
    request.conversationState?.tokenDetails?.promptContextUsageTree?.nodes ??
    [];
  const sections: string[] = [];
  for (const node of nodes) {
    if (node.inlineContent === undefined || node.inlineContent.length === 0) {
      continue;
    }
    appendSection(
      sections,
      `Prompt context node: ${node.label || node.kind || node.id}`,
      node.inlineContent,
    );
  }
  return joinBounded(sections, MAX_CONTEXT_MESSAGE_CHARS);
}

function mcpToolsToText(request: AgentRunRequest): string | undefined {
  const tools = request.mcpTools?.mcpTools ?? [];
  if (tools.length === 0) {
    return undefined;
  }
  return tools
    .slice(0, MAX_TOOL_NAMES)
    .map((tool) =>
      [
        `- ${tool.name || tool.toolName}`,
        tool.description.length > 0 ? `: ${tool.description}` : "",
        tool.providerIdentifier.length > 0
          ? ` (${tool.providerIdentifier})`
          : "",
      ].join(""),
    )
    .join("\n");
}

function nativeRequestContextToText(
  requestContext: RequestContext,
): string | undefined {
  const sections: string[] = [];
  if (requestContext.env !== undefined) {
    appendSection(
      sections,
      "Environment",
      JSON.stringify(summarizeJson(requestContext.env), null, 2),
    );
  }
  if (requestContext.gitRepos.length > 0) {
    appendSection(
      sections,
      "Git repositories",
      JSON.stringify(summarizeJson(requestContext.gitRepos), null, 2),
    );
  }
  if (requestContext.repositoryInfo.length > 0) {
    appendSection(
      sections,
      "Repository indexing info",
      JSON.stringify(summarizeJson(requestContext.repositoryInfo), null, 2),
    );
  }
  if (requestContext.projectLayouts.length > 0) {
    appendSection(
      sections,
      "Project layouts",
      JSON.stringify(summarizeJson(requestContext.projectLayouts), null, 2),
    );
  }
  for (const [filePath, content] of Object.entries(
    requestContext.fileContents,
  )) {
    appendSection(sections, `File content: ${filePath}`, content);
  }
  for (const rule of requestContext.rules) {
    appendSection(
      sections,
      `Cursor rule: ${rule.fullPath || "unknown"}`,
      rule.content || JSON.stringify(summarizeJson(rule), null, 2),
    );
  }
  for (const rule of requestContext.nonFileRules) {
    appendSection(
      sections,
      `Cursor non-file rule: ${rule.fullPath || "unknown"}`,
      rule.content || JSON.stringify(summarizeJson(rule), null, 2),
    );
  }
  if (requestContext.tools.length > 0) {
    appendSection(
      sections,
      "Available Cursor tools",
      requestContext.tools
        .slice(0, MAX_TOOL_NAMES)
        .map((tool) =>
          [
            `- ${tool.name || tool.toolName}`,
            tool.description.length > 0 ? `: ${tool.description}` : "",
            tool.providerIdentifier.length > 0
              ? ` (${tool.providerIdentifier})`
              : "",
          ].join(""),
        )
        .join("\n"),
    );
  }
  if (requestContext.mcpInstructions.length > 0) {
    appendSection(
      sections,
      "MCP instructions",
      JSON.stringify(summarizeJson(requestContext.mcpInstructions), null, 2),
    );
  }
  if (requestContext.agentSkills.length > 0) {
    appendSection(
      sections,
      "Agent skills",
      JSON.stringify(summarizeJson(requestContext.agentSkills), null, 2),
    );
  }
  pushOptionalSection(
    sections,
    "Conversation notes",
    requestContext.conversationNotesListing,
  );
  pushOptionalSection(
    sections,
    "Shared notes",
    requestContext.sharedNotesListing,
  );
  pushOptionalSection(
    sections,
    "Hooks additional context",
    requestContext.hooksAdditionalContext,
  );
  pushOptionalSection(sections, "Cloud rule", requestContext.cloudRule);
  return joinBounded(sections, MAX_CONTEXT_MESSAGE_CHARS);
}

function summarizeNativeRequestContext(
  requestContext: RequestContext,
): NonNullable<AgentRunDiagnostics["requestContext"]> {
  return {
    rules: requestContext.rules.length + requestContext.nonFileRules.length,
    tools: requestContext.tools.length,
    fileContents: Object.keys(requestContext.fileContents).length,
    gitRepos: requestContext.gitRepos.length,
    projectLayouts: requestContext.projectLayouts.length,
    agentSkills: requestContext.agentSkills.length,
  };
}

function pushOptionalSection(
  sections: string[],
  label: string,
  content: string | undefined,
): void {
  if (content !== undefined && content.trim().length > 0) {
    appendSection(sections, label, content);
  }
}

function summarizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => summarizeJson(item));
  }
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 1_000) : value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/token|key|authorization|cookie|secret/i.test(key)) {
      result[key] = "<redacted>";
    } else {
      result[key] = summarizeJson(entry);
    }
  }
  return result;
}

function pushContextMessage(
  messages: ChatMessage[],
  label: string,
  content: string | undefined,
): void {
  if (content === undefined || content.trim().length === 0) {
    return;
  }
  messages.push({
    role: "system",
    content: `${label}\n\n${content}`,
  });
}

function appendSection(
  sections: string[],
  label: string,
  content: string,
): void {
  if (content.trim().length === 0) {
    return;
  }
  sections.push(`## ${label}\n${truncate(content, MAX_CONTEXT_ITEM_CHARS)}`);
}

function joinBounded(
  sections: string[],
  maxCharacters: number,
): string | undefined {
  if (sections.length === 0) {
    return undefined;
  }
  return truncate(sections.join("\n\n"), maxCharacters);
}

function truncate(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) {
    return value;
  }
  return `${value.slice(0, maxCharacters)}\n[truncated]`;
}
