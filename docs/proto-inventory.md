# Proto Inventory

Generated from the default proto directory: `proto`.

## Extraction Summary

- Services: 67 total
- RPC methods: 1186 total
- Server-streaming RPC methods: 114 total
- Top-level messages: 5386
- Top-level enums: 399
- Proto files: `proto/agent/v1/agent.proto`, `proto/aiserver/v1/aiserver.proto`, `proto/anyrun/v1/anyrun.proto`, `proto/google/protobuf/google.proto`, `proto/internapi/v1/internapi.proto`

## Important Caveats

- Runtime interception remains route-policy allowlisted and fixture-backed.
- Unknown endpoints pass through unchanged by default.
- The extractor still logs a non-fatal Cursor bundle `TypeError` after processing services, then writes proto files successfully.

## Services

1. `agent.v1.AgentService`: 14 RPCs, 2 streaming
2. `agent.v1.ControlService`: 22 RPCs, 1 streaming
3. `agent.v1.ExecService`: 1 RPCs, 1 streaming
4. `agent.v1.LifecycleService`: 4 RPCs
5. `agent.v1.PrivateWorkerApiService`: 2 RPCs, 1 streaming
6. `agent.v1.PrivateWorkerBridgeExternalService`: 1 RPCs
7. `agent.v1.PtyHostService`: 6 RPCs, 1 streaming
8. `agent.v1.TmuxSessionService`: 4 RPCs
9. `aiserver.v1.AiBranchService`: 6 RPCs, 2 streaming
10. `aiserver.v1.AiProjectService`: 8 RPCs, 8 streaming
11. `aiserver.v1.AiService`: 187 RPCs, 55 streaming
12. `aiserver.v1.AnalyticsService`: 8 RPCs
13. `aiserver.v1.AuthService`: 14 RPCs
14. `aiserver.v1.AutomationsService`: 32 RPCs
15. `aiserver.v1.AutopilotService`: 1 RPCs, 1 streaming
16. `aiserver.v1.BackgroundComposerService`: 134 RPCs, 7 streaming
17. `aiserver.v1.BidiService`: 1 RPCs
18. `aiserver.v1.BugbotAdminService`: 5 RPCs
19. `aiserver.v1.BugbotService`: 5 RPCs
20. `aiserver.v1.ChatRequestEventService`: 1 RPCs
21. `aiserver.v1.ChatRequestEventV2Service`: 1 RPCs
22. `aiserver.v1.ChatService`: 14 RPCs, 7 streaming
23. `aiserver.v1.CiMetricsService`: 5 RPCs
24. `aiserver.v1.ClientLoggerService`: 2 RPCs
25. `aiserver.v1.CmdKService`: 6 RPCs, 4 streaming
26. `aiserver.v1.CodebaseSnapshotService`: 6 RPCs
27. `aiserver.v1.ConversationsService`: 2 RPCs
28. `aiserver.v1.CppService`: 5 RPCs, 1 streaming
29. `aiserver.v1.CursorPredictionService`: 1 RPCs
30. `aiserver.v1.DashboardService`: 459 RPCs
31. `aiserver.v1.DebuggerService`: 3 RPCs, 3 streaming
32. `aiserver.v1.DeeplinkService`: 3 RPCs
33. `aiserver.v1.DistributorService`: 1 RPCs
34. `aiserver.v1.EnterpriseAdminService`: 12 RPCs
35. `aiserver.v1.EvalTrackingService`: 29 RPCs
36. `aiserver.v1.FastApplyService`: 2 RPCs
37. `aiserver.v1.FileSyncService`: 9 RPCs
38. `aiserver.v1.FullSelfDrivingService`: 16 RPCs
39. `aiserver.v1.GitGraphService`: 9 RPCs
40. `aiserver.v1.GitIndexService`: 6 RPCs
41. `aiserver.v1.HallucinatedFunctionsService`: 5 RPCs, 4 streaming
42. `aiserver.v1.HealthService`: 7 RPCs, 4 streaming
43. `aiserver.v1.InAppAdService`: 4 RPCs
44. `aiserver.v1.InferenceService`: 2 RPCs, 1 streaming
45. `aiserver.v1.LinterService`: 5 RPCs, 1 streaming
46. `aiserver.v1.MCPRegistryService`: 1 RPCs
47. `aiserver.v1.MarketplaceService`: 1 RPCs
48. `aiserver.v1.MetricsService`: 4 RPCs
49. `aiserver.v1.NetworkService`: 2 RPCs
50. `aiserver.v1.OnlineMetricsService`: 1 RPCs
51. `aiserver.v1.PerformanceEventService`: 1 RPCs
52. `aiserver.v1.ProfilingService`: 1 RPCs
53. `aiserver.v1.ReplayChatService`: 1 RPCs, 1 streaming
54. `aiserver.v1.RepositoryService`: 19 RPCs, 3 streaming
55. `aiserver.v1.RequestReplayService`: 3 RPCs
56. `aiserver.v1.ReviewService`: 7 RPCs, 6 streaming
57. `aiserver.v1.SCMService`: 17 RPCs
58. `aiserver.v1.SchedulerService`: 2 RPCs
59. `aiserver.v1.ServerConfigService`: 1 RPCs
60. `aiserver.v1.ShadowWorkspaceService`: 13 RPCs
61. `aiserver.v1.TeamCreditsService`: 3 RPCs
62. `aiserver.v1.ToolCallEventService`: 1 RPCs
63. `aiserver.v1.TraceService`: 1 RPCs
64. `aiserver.v1.UploadService`: 9 RPCs
65. `aiserver.v1.UsageSimulationService`: 5 RPCs
66. `aiserver.v1.VmDaemonService`: 22 RPCs
67. `aiserver.v1.WebProfilingService`: 1 RPCs

## Service Methods

### `agent.v1.AgentService`

- `Run(AgentClientMessage) returns (AgentServerMessage)`
- `RunSSE(AiserverV1_BidiRequestId) returns (stream AgentServerMessage)`
- `RunPoll(AiserverV1_BidiPollRequest) returns (stream AiserverV1_BidiPollResponse)`
- `NameAgent(NameAgentRequest) returns (NameAgentResponse)`
- `UpdateConversationMetadata(UpdateConversationMetadataRequest) returns (UpdateConversationMetadataResponse)`
- `CreateTranscriptOverview(CreateTranscriptOverviewRequest) returns (CreateTranscriptOverviewResponse)`
- `GetUsableModels(GetUsableModelsRequest) returns (GetUsableModelsResponse)`
- `GetDefaultModelForCli(GetDefaultModelForCliRequest) returns (GetDefaultModelForCliResponse)`
- `GetAllowedModelIntents(GetAllowedModelIntentsRequest) returns (GetAllowedModelIntentsResponse)`
- `UploadConversationBlobs(UploadConversationBlobsRequest) returns (UploadConversationBlobsResponse)`
- `GetSignedUrlForAttachedMedia(GetSignedUrlForAttachedMediaRequest) returns (GetSignedUrlForAttachedMediaResponse)`
- `NotifyConversationClone(NotifyConversationCloneRequest) returns (NotifyConversationCloneResponse)`
- `GetNewChatNudgeLegacyModelPicker(GetNewChatNudgeLegacyModelPickerRequest) returns (GetNewChatNudgeLegacyModelPickerResponse)`
- `GetNewChatNudgeParameterizedModelPicker(GetNewChatNudgeParameterizedModelPickerRequest) returns (GetNewChatNudgeParameterizedModelPickerResponse)`

### `agent.v1.ControlService`

- `Ping(PingRequest) returns (PingResponse)`
- `GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse)`
- `Exec(ExecRequest) returns (stream ExecResponse)`
- `ListDirectory(ListDirectoryRequest) returns (ListDirectoryResponse)`
- `ReadTextFile(ReadTextFileRequest) returns (ReadTextFileResponse)`
- `WriteTextFile(WriteTextFileRequest) returns (WriteTextFileResponse)`
- `ReadBinaryFile(ReadBinaryFileRequest) returns (ReadBinaryFileResponse)`
- `WriteBinaryFile(WriteBinaryFileRequest) returns (WriteBinaryFileResponse)`
- `GetDiff(AiserverV1_GetDiffRequest) returns (AiserverV1_GetDiffResponse)`
- `BatchGetDiff(BatchGetDiffRequest) returns (BatchGetDiffResponse)`
- `GetWorkspaceChangesHash(GetWorkspaceChangesHashRequest) returns (GetWorkspaceChangesHashResponse)`
- `RefreshGithubAccessToken(RefreshGithubAccessTokenRequest) returns (RefreshGithubAccessTokenResponse)`
- `WarmRemoteAccessServer(WarmRemoteAccessServerRequest) returns (WarmRemoteAccessServerResponse)`
- `ListArtifacts(ListArtifactsRequest) returns (ListArtifactsResponse)`
- `UploadArtifacts(UploadArtifactsRequest) returns (UploadArtifactsResponse)`
- `RestoreArtifacts(RestoreArtifactsRequest) returns (RestoreArtifactsResponse)`
- `GetMcpRefreshTokens(GetMcpRefreshTokensRequest) returns (GetMcpRefreshTokensResponse)`
- `DownloadCursorServer(DownloadCursorServerRequest) returns (DownloadCursorServerResponse)`
- `UpdateEnvironmentVariables(UpdateEnvironmentVariablesRequest) returns (UpdateEnvironmentVariablesResponse)`
- `ReloadAgentSkills(ReloadAgentSkillsRequest) returns (ReloadAgentSkillsResponse)`
- `ReloadPlugins(ReloadPluginsRequest) returns (ReloadPluginsResponse)`
- `InstallPluginArtifact(InstallPluginArtifactRequest) returns (InstallPluginArtifactResponse)`

### `agent.v1.ExecService`

- `Exec(ExecServerMessage) returns (stream ExecStreamElement)`

### `agent.v1.LifecycleService`

- `ResetInstance(Empty) returns (Empty)`
- `RenewInstance(Empty) returns (Empty)`
- `ClaimWorker(ClaimWorkerRequest) returns (Empty)`
- `ReleaseWorker(ReleaseWorkerRequest) returns (Empty)`

### `agent.v1.PrivateWorkerApiService`

- `GetWorkerId(GoogleProtobuf_Empty) returns (GetWorkerIdResponse)`
- `WatchStatus(GoogleProtobuf_Empty) returns (stream WatchStatusResponse)`

### `agent.v1.PrivateWorkerBridgeExternalService`

- `Connect(Frame) returns (Frame)`

### `agent.v1.PtyHostService`

- `SpawnPty(SpawnPtyRequest) returns (SpawnPtyResponse)`
- `AttachPty(AttachPtyRequest) returns (stream PtyEvent)`
- `SendInput(SendInputRequest) returns (SendInputResponse)`
- `ResizePty(ResizePtyRequest) returns (ResizePtyResponse)`
- `ListPtys(ListPtysRequest) returns (ListPtysResponse)`
- `TerminatePty(TerminatePtyRequest) returns (TerminatePtyResponse)`

### `agent.v1.TmuxSessionService`

- `CreateSession(CreateTmuxSessionRequest) returns (CreateTmuxSessionResponse)`
- `ListSessions(ListTmuxSessionsRequest) returns (ListTmuxSessionsResponse)`
- `KillSession(KillTmuxSessionRequest) returns (KillTmuxSessionResponse)`
- `AttachSession(AttachTmuxSessionRequest) returns (AttachTmuxSessionResponse)`

### `aiserver.v1.AiBranchService`

- `OpusChainGetPlan(OpusChainGetPlanRequest) returns (stream OpusChainGetPlanResponse)`
- `OpusChainGetFileInstruction(OpusChainGetFileInstructionRequest) returns (OpusChainGetFileInstructionResponse)`
- `OpusChainReflect(OpusChainReflectRequest) returns (stream OpusChainReflectResponse)`
- `OpusChainGetFilePaths(OpusChainGetFilePathsRequest) returns (OpusChainGetFilePathsResponse)`
- `RecordAcceptedPatch(RecordAcceptedPatchRequest) returns (RecordAcceptedPatchResponse)`
- `ReportModeSelection(ReportModeSelectionRequest) returns (ReportModeSelectionResponse)`

### `aiserver.v1.AiProjectService`

- `AiProjectAgentInit(AiProjectAgentInitRequest) returns (stream AiProjectClarificationResponse)`
- `AiProjectClarification(AiProjectClarificationRequest) returns (stream AiProjectClarificationResponse)`
- `AiProjectPlan(AiProjectAgentPlanRequest) returns (stream AiProjectAgentPlanResponse)`
- `AiProjectPlanFeedback(AiProjectPlanFeedbackRequest) returns (stream AiProjectPlanFeedbackResponse)`
- `AiProjectBreakdown(AiProjectBreakdownRequest) returns (stream AiProjectBreakdownResponse)`
- `AiProjectBreakdownFeedback(AiProjectBreakdownFeedbackRequest) returns (stream AiProjectBreakdownFeedbackResponse)`
- `AiProjectStep(AiProjectStepRequest) returns (stream AiProjectStepResponseWrapped)`
- `AiProjectStepFeedback(AiProjectStepFeedbackRequest) returns (stream AiProjectStepFeedbackResponseWrapped)`

### `aiserver.v1.AiService`

- `ServerTime(ServerTimeRequest) returns (ServerTimeResponse)`
- `HealthCheck(HealthCheckRequest) returns (HealthCheckResponse)`
- `PrivacyCheck(PrivacyCheckRequest) returns (PrivacyCheckResponse)`
- `TimeLeftHealthCheck(HealthCheckRequest) returns (TimeLeftHealthCheckResponse)`
- `ThrowErrorCheck(ThrowErrorCheckRequest) returns (ThrowErrorCheckResponse)`
- `AvailableModels(AvailableModelsRequest) returns (AvailableModelsResponse)`
- `StreamChatTryReallyHard(GetChatRequest) returns (stream StreamChatResponse)`
- `RerankDocuments(RerankDocumentsRequest) returns (RerankDocumentsResponse)`
- `StreamComposer(GetComposerChatRequest) returns (stream StreamChatResponse)`
- `StreamComposerContext(StreamChatContextRequest) returns (stream StreamChatContextResponse)`
- `WarmComposerCache(GetComposerChatRequest) returns (WarmComposerCacheResponse)`
- `KeepComposerCacheWarm(KeepComposerCacheWarmRequest) returns (KeepComposerCacheWarmResponse)`
- `CountTokens(CountTokensRequest) returns (CountTokensResponse)`
- `StreamPotentialLocs(PotentialLocsRequest) returns (stream PotentialLocsResponse)`
- `StreamPotentialLocsUnderneath(PotentialLocsUnderneathRequest) returns (stream PotentialLocsUnderneathResponse)`
- `StreamPotentialLocsInitialQueries(PotentialLocsInitialQueriesRequest) returns (stream PotentialLocsInitialQueriesResponse)`
- `GetChatTitle(GetChatTitleRequest) returns (GetChatTitleResponse)`
- `GetCompletion(GetCompletionRequest) returns (GetCompletionResponse)`
- `IsolatedTreesitter(IsolatedTreesitterRequest) returns (IsolatedTreesitterResponse)`
- `GetSimplePrompt(GetSimplePromptRequest) returns (GetSimplePromptResponse)`
- `GetPassthroughPrompt(GetPassthroughPromptRequest) returns (GetPassthroughPromptResponse)`
- `SuggestQuickActions(SuggestQuickActionsRequest) returns (SuggestQuickActionsResponse)`
- `CheckLongFilesFit(GetChatRequest) returns (CheckLongFilesFitResponse)`
- `GetEvaluationPrompt(GetEvaluationPromptRequest) returns (GetEvaluationPromptResponse)`
- `GetUserInfo(GetUserInfoRequest) returns (GetUserInfoResponse)`
- `StreamChat(GetChatRequest) returns (stream StreamChatResponse)`
- `StreamChatWeb(GetChatRequest) returns (stream StreamChatResponse)`
- `WarmChatCache(WarmChatCacheRequest) returns (WarmChatCacheResponse)`
- `StreamEdit(StreamEditRequest) returns (stream StreamChatResponse)`
- `PreloadEdit(PreloadEditRequest) returns (PreloadEditResponse)`
- `StreamFastEdit(StreamFastEditRequest) returns (stream StreamFastEditResponse)`
- `StreamGenerate(StreamGenerateRequest) returns (stream StreamChatResponse)`
- `StreamInlineLongCompletion(StreamInlineLongCompletionRequest) returns (stream StreamChatResponse)`
- `SlashEdit(SlashEditRequest) returns (stream SlashEditResponse)`
- `SlashEditFollowUpWithPreviousEdits(SlashEditFollowUpWithPreviousEditsRequest) returns (stream StreamSlashEditFollowUpWithPreviousEditsResponse)`
- `StreamAiPreviews(StreamAiPreviewsRequest) returns (stream StreamAiPreviewsResponse)`
- `ShouldTurnOnCppOnboarding(ShouldTurnOnCppOnboardingRequest) returns (ShouldTurnOnCppOnboardingResponse)`
- `GetComposerAutocomplete(GetComposerAutocompleteRequest) returns (GetComposerAutocompleteResponse)`
- `StreamReview(ReviewRequest) returns (stream ReviewResponse)`
- `StreamReviewChat(ReviewChatRequest) returns (stream ReviewChatResponse)`
- `CheckQueuePosition(CheckQueuePositionRequest) returns (CheckQueuePositionResponse)`
- `CheckUsageBasedPrice(CheckUsageBasedPriceRequest) returns (CheckUsageBasedPriceResponse)`
- `DoThisForMeCheck(DoThisForMeCheckRequest) returns (DoThisForMeCheckResponse)`
- `StreamDoThisForMe(DoThisForMeRequest) returns (stream DoThisForMeResponseWrapped)`
- `StreamChatToolformer(GetChatRequest) returns (stream StreamChatToolformerResponse)`
- `StreamChatToolformerContinue(StreamChatToolformerContinueRequest) returns (stream StreamChatToolformerResponse)`
- `PushAiThought(PushAiThoughtRequest) returns (PushAiThoughtResponse)`
- `CheckDoableAsTask(CheckDoableAsTaskRequest) returns (CheckDoableAsTaskResponse)`
- `ReportGroundTruthCandidate(ReportGroundTruthCandidateRequest) returns (ReportGroundTruthCandidateResponse)`
- `ReportCmdKFate(ReportCmdKFateRequest) returns (ReportCmdKFateResponse)`
- `ShowWelcomeScreen(ShowWelcomeScreenRequest) returns (ShowWelcomeScreenResponse)`
- `InterfaceAgentInit(InterfaceAgentInitRequest) returns (InterfaceAgentInitResponse)`
- `StreamInterfaceAgentStatus(StreamInterfaceAgentStatusRequest) returns (stream StreamInterfaceAgentStatusResponse)`
- `TaskGetInterfaceAgentStatus(TaskGetInterfaceAgentStatusRequest) returns (stream TaskGetInterfaceAgentStatusResponseWrapped)`
- `UpdateVscodeProfile(UpdateVscodeProfileRequest) returns (UpdateVscodeProfileResponse)`
- `TaskInit(TaskInitRequest) returns (TaskInitResponse)`
- `TaskPause(TaskPauseRequest) returns (TaskPauseResponse)`
- `TaskInfo(TaskInfoRequest) returns (TaskInfoResponse)`
- `TaskStreamLog(TaskStreamLogRequest) returns (stream TaskStreamLogResponse)`
- `TaskSendMessage(TaskSendMessageRequest) returns (TaskSendMessageResponse)`
- `TaskProvideResult(TaskProvideResultRequest) returns (TaskProvideResultResponse)`
- `CreateExperimentalIndex(CreateExperimentalIndexRequest) returns (CreateExperimentalIndexResponse)`
- `ListExperimentalIndexFiles(ListExperimentalIndexFilesRequest) returns (ListExperimentalIndexFilesResponse)`
- `ListenExperimentalIndex(ListenExperimentalIndexRequest) returns (stream ListenExperimentalIndexResponse)`
- `RegisterFileToIndex(RegisterFileToIndexRequest) returns (RequestReceivedResponse)`
- `SetupIndexDependencies(SetupIndexDependenciesRequest) returns (SetupIndexDependenciesResponse)`
- `ComputeIndexTopoSort(ComputeIndexTopoSortRequest) returns (ComputeIndexTopoSortResponse)`
- `StreamChatDeepContext(StreamChatDeepContextRequest) returns (stream StreamChatDeepContextResponse)`
- `ChooseCodeReferences(ChooseCodeReferencesRequest) returns (RequestReceivedResponse)`
- `RegisterCodeReferences(RegisterCodeReferencesRequest) returns (RegisterCodeReferencesResponse)`
- `ExtractPaths(ExtractPathsRequest) returns (ExtractPathsResponse)`
- `SummarizeWithReferences(SummarizeWithReferencesRequest) returns (RequestReceivedResponse)`
- `DocumentationQuery(DocumentationQueryRequest) returns (DocumentationQueryResponse)`
- `AvailableDocs(AvailableDocsRequest) returns (AvailableDocsResponse)`
- `ReportFeedback(ReportFeedbackRequest) returns (ReportFeedbackResponse)`
- `ReportBug(ReportBugRequest) returns (ReportBugResponse)`
- `StreamChatContext(StreamChatContextRequest) returns (stream StreamChatContextResponse)`
- `GenerateTldr(GenerateTldrRequest) returns (GenerateTldrResponse)`
- `TaskStreamChatContext(TaskStreamChatContextRequest) returns (stream TaskStreamChatContextResponseWrapped)`
- `RerankResults(RerankerRequest) returns (RerankerResponse)`
- `ModelQuery(ModelQueryRequest) returns (ModelQueryResponse)`
- `ModelQueryV2(ModelQueryRequest) returns (stream ModelQueryResponseV2)`
- `IntentPrediction(IntentPredictionRequest) returns (IntentPredictionResponse)`
- `GetChatSuggestions(GetChatSuggestionsRequest) returns (GetChatSuggestionsResponse)`
- `GetUserInstructions(GetUserInstructionsRequest) returns (GetUserInstructionsResponse)`
- `StreamCursorTutor(StreamCursorTutorRequest) returns (stream StreamCursorTutorResponse)`
- `CheckFeatureStatus(CheckFeatureStatusRequest) returns (CheckFeatureStatusResponse)`
- `CheckFeaturesStatus(CheckFeaturesStatusRequest) returns (CheckFeaturesStatusResponse)`
- `CheckFeatureStatusUnauthenticated(CheckFeatureStatusRequest) returns (CheckFeatureStatusResponse)`
- `GetEffectiveTokenLimit(GetEffectiveTokenLimitRequest) returns (GetEffectiveTokenLimitResponse)`
- `GetContextScores(ContextScoresRequest) returns (ContextScoresResponse)`
- `StreamCpp(StreamCppRequest) returns (stream StreamCppResponse)`
- `CppConfig(CppConfigRequest) returns (CppConfigResponse)`
- `CppEditHistoryStatus(CppEditHistoryStatusRequest) returns (CppEditHistoryStatusResponse)`
- `CppAppend(CppAppendRequest) returns (CppAppendResponse)`
- `RefreshTabContext(RefreshTabContextRequest) returns (RefreshTabContextResponse)`
- `CheckNumberConfig(CheckNumberConfigRequest) returns (CheckNumberConfigResponse)`
- `CheckNumberConfigUnauthenticated(CheckNumberConfigRequest) returns (CheckNumberConfigResponse)`
- `CheckNumberConfigs(CheckNumberConfigsRequest) returns (CheckNumberConfigsResponse)`
- `StreamTerminalAutocomplete(StreamTerminalAutocompleteRequest) returns (stream StreamTerminalAutocompleteResponse)`
- `StreamPseudocodeGenerator(StreamPseudocodeGeneratorRequest) returns (stream StreamPseudocodeGeneratorResponse)`
- `StreamPseudocodeMapper(StreamPseudocodeMapperRequest) returns (stream StreamPseudocodeMapperResponse)`
- `AcknowledgeGracePeriodDisclaimer(AcknowledgeGracePeriodDisclaimerRequest) returns (AcknowledgeGracePeriodDisclaimerResponse)`
- `StreamAiLintBug(StreamAiLintBugRequest) returns (stream StreamAiLintBugResponse)`
- `StreamAiCursorHelp(StreamAiCursorHelpRequest) returns (stream StreamAiCursorHelpResponse)`
- `LogUserLintReply(LogUserLintReplyRequest) returns (LogUserLintReplyResponse)`
- `LogLinterExplicitUserFeedback(LogLinterExplicitUserFeedbackRequest) returns (LogLinterExplicitUserFeedbackResponse)`
- `StreamFixMarkers(FixMarkersRequest) returns (stream FixMarkersResponse)`
- `ReportInlineAction(ReportInlineActionRequest) returns (ReportInlineActionResponse)`
- `StreamPriomptPrompt(StreamPriomptPromptRequest) returns (stream StreamPriomptPromptResponse)`
- `StreamLint(StreamLintRequest) returns (stream StreamChatResponse)`
- `StreamNewLintRule(StreamNewRuleRequest) returns (stream StreamChatResponse)`
- `AiProject(AiProjectRequest) returns (stream AiProjectResponse)`
- `ToCamelCase(ToCamelCaseRequest) returns (ToCamelCaseResponse)`
- `ReportGenerationFeedback(ReportGenerationFeedbackRequest) returns (ReportGenerationFeedbackResponse)`
- `ReportAgentFeedback(ReportAgentFeedbackRequest) returns (ReportAgentFeedbackResponse)`
- `ReportAgentMessageFeedback(ReportAgentMessageFeedbackRequest) returns (ReportAgentMessageFeedbackResponse)`
- `GetThoughtAnnotation(GetThoughtAnnotationRequest) returns (GetThoughtAnnotationResponse)`
- `StreamWebCmdKV1(StreamWebCmdKV1Request) returns (stream StreamWebCmdKV1Response)`
- `StreamNextCursorPrediction(StreamNextCursorPredictionRequest) returns (stream StreamNextCursorPredictionResponse)`
- `IsCursorPredictionEnabled(IsCursorPredictionEnabledRequest) returns (IsCursorPredictionEnabledResponse)`
- `GetCppEditClassification(GetCppEditClassificationRequest) returns (GetCppEditClassificationResponse)`
- `GetTerminalCompletion(GetTerminalCompletionRequest) returns (GetTerminalCompletionResponse)`
- `TakeNotesOnCommitDiff(TakeNotesOnCommitDiffRequest) returns (TakeNotesOnCommitDiffResponse)`
- `BulkEmbed(BulkEmbedRequest) returns (BulkEmbedResponse)`
- `BackgroundCmdKEval(BackgroundCmdKEvalRequest) returns (stream BackgroundCmdKEvalResponse)`
- `BackgroundCmdK(BackgroundCmdKRequest) returns (stream BackgroundCmdKResponse)`
- `CalculateAutoSelection(CalculateAutoSelectionRequest) returns (CalculateAutoSelectionResponse)`
- `GetAtSymbolSuggestions(GetAtSymbolSuggestionsRequest) returns (GetAtSymbolSuggestionsResponse)`
- `GetCodebaseQuestions(GetChatRequest) returns (GetCodebaseQuestionsResponse)`
- `CppEditHistoryAppend(EditHistoryAppendChangesRequest) returns (EditHistoryAppendChangesResponse)`
- `DevOnlyGetPastRequestIds(DevOnlyGetPastRequestIdsRequest) returns (DevOnlyGetPastRequestIdsResponse)`
- `GetFilesForComposer(GetFilesForComposerRequest) returns (GetFilesForComposerResponse)`
- `TryParseTypeScriptTreeSitter(TryParseTypeScriptTreeSitterRequest) returns (TryParseTypeScriptTreeSitterResponse)`
- `NameTab(NameTabRequest) returns (NameTabResponse)`
- `IsTerminalFinishedV2(IsTerminalFinishedRequest) returns (IsTerminalFinishedResponseV2)`
- `TestModelStatus(TestModelStatusRequest) returns (TestModelStatusResponse)`
- `FindBugs(FindBugsRequest) returns (FindBugsResponse)`
- `ContextReranking(ContextRerankingRequest) returns (ContextRerankingResponse)`
- `AutoContext(AutoContextRequest) returns (AutoContextResponse)`
- `WriteGitCommitMessage(WriteGitCommitMessageRequest) returns (WriteGitCommitMessageResponse)`
- `WriteGitBranchName(WriteGitBranchNameRequest) returns (WriteGitBranchNameResponse)`
- `StreamBugBot(StreamBugBotRequest) returns (stream StreamBugBotResponse)`
- `StreamBugBotAgentic(StreamBugBotAgenticClientMessage) returns (StreamBugBotAgenticServerMessage)`
- `StreamBugBotAgenticSSE(BidiRequestId) returns (stream StreamBugBotAgenticServerMessage)`
- `StreamBugBotAgenticPoll(BidiPollRequest) returns (stream BidiPollResponse)`
- `StreamUiBestOfNJudge(StreamUiBestOfNJudgeClientMessage) returns (StreamUiBestOfNJudgeServerMessage)`
- `StreamUiBestOfNJudgeSSE(BidiRequestId) returns (stream StreamUiBestOfNJudgeServerMessage)`
- `StreamUiBestOfNJudgePoll(BidiPollRequest) returns (stream BidiPollResponse)`
- `CheckBugBotPrice(CheckBugBotPriceRequest) returns (CheckBugBotPriceResponse)`
- `CheckBugBotTelemetryHealthy(CheckBugBotTelemetryHealthyRequest) returns (CheckBugBotTelemetryHealthyResponse)`
- `RecordIdeBugReaction(RecordIdeBugReactionRequest) returns (RecordIdeBugReactionResponse)`
- `GetSuggestedBugBotIterations(GetSuggestedBugBotIterationsRequest) returns (GetSuggestedBugBotIterationsResponse)`
- `GetEditorBugbotAutoRunStatus(GetEditorBugbotAutoRunStatusRequest) returns (GetEditorBugbotAutoRunStatusResponse)`
- `TestBidi(TestBidiRequest) returns (TestBidiResponse)`
- `StreamDiffReview(GetDiffReviewRequest) returns (stream StreamDiffReviewResponse)`
- `StreamDiffReviewByFile(GetDiffReviewRequest) returns (stream StreamDiffReviewByFileResponse)`
- `GetModelLabels(GetModelLabelsRequest) returns (GetModelLabelsResponse)`
- `GetLastDefaultModelNudge(GetLastDefaultModelNudgeRequest) returns (GetLastDefaultModelNudgeResponse)`
- `GetDefaultModelNudgeData(GetDefaultModelNudgeDataRequest) returns (GetDefaultModelNudgeDataResponse)`
- `GetDefaultModel(GetDefaultModelRequest) returns (GetDefaultModelResponse)`
- `ReportCommitAiAnalytics(ReportCommitAiAnalyticsRequest) returns (ReportCommitAiAnalyticsResponse)`
- `TestBedrockCredentials(TestBedrockCredentialsRequest) returns (TestBedrockCredentialsResponse)`
- `ReportAiCodeChangeMetrics(ReportAiCodeChangeMetricsRequest) returns (ReportAiCodeChangeMetricsResponse)`
- `ReportProcessMetrics(ReportProcessMetricsRequest) returns (ReportProcessMetricsResponse)`
- `ReportProcessMetricsV2(ReportProcessMetricsV2Request) returns (ReportProcessMetricsV2Response)`
- `ReportClientNumericMetrics(ReportClientNumericMetricsRequest) returns (ReportClientNumericMetricsResponse)`
- `PotentiallyGenerateMemory(PotentiallyGenerateMemoryRequest) returns (PotentiallyGenerateMemoryResponse)`
- `KnowledgeBaseAdd(KnowledgeBaseAddRequest) returns (KnowledgeBaseAddResponse)`
- `KnowledgeBaseList(KnowledgeBaseListRequest) returns (KnowledgeBaseListResponse)`
- `KnowledgeBaseRemove(KnowledgeBaseRemoveRequest) returns (KnowledgeBaseRemoveResponse)`
- `KnowledgeBaseUpdate(KnowledgeBaseUpdateRequest) returns (KnowledgeBaseUpdateResponse)`
- `FetchRelevantKnowledgeForConversation(FetchRelevantKnowledgeForConversationRequest) returns (FetchRelevantKnowledgeForConversationResponse)`
- `InferBackgroundComposerScripts(InferBackgroundComposerScriptsRequest) returns (InferBackgroundComposerScriptsResponse)`
- `GetBackgroundComposerFeedbackLink(GetBackgroundComposerFeedbackLinkRequest) returns (GetBackgroundComposerFeedbackLinkResponse)`
- `GetUsableModels(AgentV1_GetUsableModelsRequest) returns (AgentV1_GetUsableModelsResponse)`
- `GetDefaultModelForCli(AgentV1_GetDefaultModelForCliRequest) returns (AgentV1_GetDefaultModelForCliResponse)`
- `StreamComposerEnhancer(ComposerEnhancerClientMessage) returns (ComposerEnhancerServerMessage)`
- `StreamComposerEnhancerSSE(BidiRequestId) returns (stream ComposerEnhancerServerMessage)`
- `StreamComposerEnhancerPoll(BidiPollRequest) returns (stream BidiPollResponse)`
- `StreamStt(SttClientMessage) returns (SttServerMessage)`
- `StreamSttSSE(BidiRequestId) returns (stream SttServerMessage)`
- `StreamSttPoll(BidiPollRequest) returns (stream BidiPollResponse)`
- `TranscribeAudio(TranscribeAudioRequest) returns (TranscribeAudioResponse)`
- `NameAgent(AgentV1_NameAgentRequest) returns (AgentV1_NameAgentResponse)`
- `EvaluatePromptHook(EvaluatePromptHookRequest) returns (EvaluatePromptHookResponse)`
- `GetCloudSetupBlockers(GetCloudSetupBlockersRequest) returns (GetCloudSetupBlockersResponse)`

### `aiserver.v1.AnalyticsService`

- `TrackEvents(TrackEventsRequest) returns (TrackEventsResponse)`
- `Batch(BatchRequest) returns (BatchResponse)`
- `BootstrapStatsig(BootstrapStatsigRequest) returns (BootstrapStatsigResponse)`
- `GetFirstWindowStatsigDecision(GetFirstWindowStatsigDecisionRequest) returns (GetFirstWindowStatsigDecisionResponse)`
- `SubmitLogs(SubmitLogsRequest) returns (SubmitLogsResponse)`
- `IngestConversation(IngestConversationRequest) returns (IngestConversationResponse)`
- `UploadIssueTrace(UploadIssueTraceRequest) returns (UploadIssueTraceResponse)`
- `DownloadIssueTraces(DownloadIssueTracesRequest) returns (DownloadIssueTracesResponse)`

### `aiserver.v1.AuthService`

- `GetEmail(GetEmailRequest) returns (GetEmailResponse)`
- `GetUserMeta(GetUserMetaRequest) returns (GetUserMetaResponse)`
- `EmailValid(EmailValidRequest) returns (EmailValidResponse)`
- `DownloadUpdate(DownloadUpdateRequest) returns (DownloadUpdateResponse)`
- `MarkPrivacy(MarkPrivacyRequest) returns (MarkPrivacyResponse)`
- `SwitchCmdKFraction(SwitchCmdKFractionRequest) returns (SwitchCmdKFractionResponse)`
- `GetCustomerId(CustomerIdRequest) returns (CustomerIdResponse)`
- `SetPrivacyMode(SetPrivacyModeRequest) returns (SetPrivacyModeResponse)`
- `GetSessionToken(GetSessionTokenRequest) returns (GetSessionTokenResponse)`
- `CheckSessionToken(CheckSessionTokenRequest) returns (CheckSessionTokenResponse)`
- `CreateMobileSession(CreateMobileSessionRequest) returns (CreateMobileSessionResponse)`
- `ListActiveSessions(ListActiveSessionsRequest) returns (ListActiveSessionsResponse)`
- `RevokeSession(RevokeSessionRequest) returns (RevokeSessionResponse)`
- `ListJwtPublicKeys(ListJwtPublicKeysRequest) returns (ListJwtPublicKeysResponse)`

### `aiserver.v1.AutomationsService`

- `CreateAutomation(CreateAutomationRequest) returns (CreateAutomationResponse)`
- `ListAutomations(ListAutomationsRequest) returns (ListAutomationsResponse)`
- `GetAutomation(GetAutomationRequest) returns (GetAutomationResponse)`
- `UpdateAutomation(UpdateAutomationRequest) returns (UpdateAutomationResponse)`
- `UpdateAutomationAuthoringMode(UpdateAutomationAuthoringModeRequest) returns (UpdateAutomationAuthoringModeResponse)`
- `ValidateAutomationSpec(ValidateAutomationSpecRequest) returns (ValidateAutomationSpecResponse)`
- `ApplyAutomationSpec(ApplyAutomationSpecRequest) returns (ApplyAutomationSpecResponse)`
- `DeleteAutomation(DeleteAutomationRequest) returns (DeleteAutomationResponse)`
- `TestAutomation(TestAutomationRequest) returns (TestAutomationResponse)`
- `TestAutomationFilter(TestAutomationFilterRequest) returns (TestAutomationFilterResponse)`
- `ListAutomationRuns(ListAutomationRunsRequest) returns (ListAutomationRunsResponse)`
- `GetAutomationRun(GetAutomationRunRequest) returns (GetAutomationRunResponse)`
- `ListAllRuns(ListAllRunsRequest) returns (ListAllRunsResponse)`
- `GetRunSummary(GetRunSummaryRequest) returns (GetRunSummaryResponse)`
- `GetSecuritybotResolutionStats(GetSecuritybotResolutionStatsRequest) returns (GetSecuritybotResolutionStatsResponse)`
- `CancelAutomationRun(CancelAutomationRunRequest) returns (CancelAutomationRunResponse)`
- `CancelAllAutomationRuns(CancelAllAutomationRunsRequest) returns (CancelAllAutomationRunsResponse)`
- `RetryAutomationRun(RetryAutomationRunRequest) returns (RetryAutomationRunResponse)`
- `ListAutomationMemories(ListAutomationMemoriesRequest) returns (ListAutomationMemoriesResponse)`
- `GetAutomationMemory(GetAutomationMemoryRequest) returns (GetAutomationMemoryResponse)`
- `UpdateAutomationMemory(UpdateAutomationMemoryRequest) returns (UpdateAutomationMemoryResponse)`
- `ListWorkflowTemplates(ListWorkflowTemplatesRequest) returns (ListWorkflowTemplatesResponse)`
- `GetWorkflowTemplate(GetWorkflowTemplateRequest) returns (GetWorkflowTemplateResponse)`
- `CreateWorkflowFromTemplate(CreateWorkflowFromTemplateRequest) returns (CreateWorkflowFromTemplateResponse)`
- `ValidateAutomationTools(ValidateAutomationToolsRequest) returns (ValidateAutomationToolsResponse)`
- `BuilderCompletion(BuilderCompletionRequest) returns (BuilderCompletionResponse)`
- `DisableAutomationForTeamShutdown(DisableAutomationForTeamShutdownRequest) returns (DisableAutomationForTeamShutdownResponse)`
- `GetSentryAuthUrl(GetSentryAuthUrlRequest) returns (GetSentryAuthUrlResponse)`
- `ConnectSentryCallback(ConnectSentryCallbackRequest) returns (ConnectSentryCallbackResponse)`
- `GetSentryStatus(GetSentryStatusRequest) returns (GetSentryStatusResponse)`
- `GetSentryProjects(GetSentryProjectsRequest) returns (GetSentryProjectsResponse)`
- `DisconnectSentry(DisconnectSentryRequest) returns (DisconnectSentryResponse)`

### `aiserver.v1.AutopilotService`

- `StreamAutopilot(AutopilotRequest) returns (stream AutopilotResponse)`

### `aiserver.v1.BackgroundComposerService`

- `ListBackgroundComposers(ListBackgroundComposersRequest) returns (ListBackgroundComposersResponse)`
- `AttachBackgroundComposer(AttachBackgroundComposerRequest) returns (stream AttachBackgroundComposerResponse)`
- `StreamConversation(StreamConversationRequest) returns (stream StreamConversationResponse)`
- `GetLatestAgentConversationState(GetLatestAgentConversationStateRequest) returns (GetLatestAgentConversationStateResponse)`
- `GetBlobForAgentKV(GetBlobForAgentKVRequest) returns (GetBlobForAgentKVResponse)`
- `AttachBackgroundComposerLogs(AttachBackgroundComposerLogsRequest) returns (stream AttachBackgroundComposerLogsResponse)`
- `AttachAgentStartupTrace(AttachAgentStartupTraceRequest) returns (stream AttachAgentStartupTraceResponse)`
- `StartBackgroundComposerFromSnapshot(StartBackgroundComposerFromSnapshotRequest) returns (StartBackgroundComposerFromSnapshotResponse)`
- `MakePRBackgroundComposer(MakePRBackgroundComposerRequest) returns (MakePRBackgroundComposerResponse)`
- `OpenPRBackgroundComposer(OpenPRBackgroundComposerRequest) returns (OpenPRBackgroundComposerResponse)`
- `GetBackgroundComposerStatus(GetBackgroundComposerStatusRequest) returns (GetBackgroundComposerStatusResponse)`
- `AddAsyncFollowupBackgroundComposer(AddAsyncFollowupBackgroundComposerRequest) returns (AddAsyncFollowupBackgroundComposerResponse)`
- `SubmitInteractionResponseBackgroundComposer(SubmitInteractionResponseBackgroundComposerRequest) returns (SubmitInteractionResponseBackgroundComposerResponse)`
- `ListPendingFollowups(ListPendingFollowupsRequest) returns (ListPendingFollowupsResponse)`
- `UpdatePendingFollowup(UpdatePendingFollowupRequest) returns (UpdatePendingFollowupResponse)`
- `DeletePendingFollowup(DeletePendingFollowupRequest) returns (DeletePendingFollowupResponse)`
- `ReorderPendingFollowup(ReorderPendingFollowupRequest) returns (ReorderPendingFollowupResponse)`
- `SubmitPendingFollowupNow(SubmitPendingFollowupNowRequest) returns (SubmitPendingFollowupNowResponse)`
- `MarkFollowupEditing(MarkFollowupEditingRequest) returns (MarkFollowupEditingResponse)`
- `GetCursorServerUrl(GetCursorServerUrlRequest) returns (GetCursorServerUrlResponse)`
- `WarmCursorServerDownload(WarmCursorServerDownloadRequest) returns (WarmCursorServerDownloadResponse)`
- `PreWarmPod(PreWarmPodRequest) returns (PreWarmPodResponse)`
- `PauseBackgroundComposer(PauseBackgroundComposerRequest) returns (PauseBackgroundComposerResponse)`
- `ResumeBackgroundComposer(ResumeBackgroundComposerRequest) returns (ResumeBackgroundComposerResponse)`
- `ArchiveBackgroundComposer(ArchiveBackgroundComposerRequest) returns (ArchiveBackgroundComposerResponse)`
- `DeleteBackgroundComposer(DeleteBackgroundComposerRequest) returns (DeleteBackgroundComposerResponse)`
- `GetBackgroundComposerInfo(GetBackgroundComposerInfoRequest) returns (GetBackgroundComposerInfoResponse)`
- `GetBackgroundComposerEnvironmentVersion(GetBackgroundComposerEnvironmentVersionRequest) returns (GetBackgroundComposerEnvironmentVersionResponse)`
- `GetEnvironmentHistory(GetEnvironmentHistoryRequest) returns (GetEnvironmentHistoryResponse)`
- `GetBackgroundComposerTimings(GetBackgroundComposerTimingsRequest) returns (GetBackgroundComposerTimingsResponse)`
- `GetBackgroundComposerRepositoryInfo(GetBackgroundComposerRepositoryInfoRequest) returns (GetBackgroundComposerRepositoryInfoResponse)`
- `GetMachine(GetMachineRequest) returns (GetMachineResponse)`
- `ListDetailedBackgroundComposers(ListDetailedBackgroundComposersRequest) returns (ListDetailedBackgroundComposersResponse)`
- `GetGithubAccessTokenForRepos(GetGithubAccessTokenForReposRequest) returns (GetGithubAccessTokenForReposResponse)`
- `MakeGithubRequest(MakeGithubRequestRequest) returns (MakeGithubRequestResponse)`
- `GetBackgroundComposerDiffDetails(GetBackgroundComposerDiffDetailsRequest) returns (GetBackgroundComposerDiffDetailsResponse)`
- `GetOptimizedDiffDetails(GetOptimizedDiffDetailsRequest) returns (GetOptimizedDiffDetailsResponse)`
- `GetBackgroundComposerChangesHash(GetBackgroundComposerChangesHashRequest) returns (GetBackgroundComposerChangesHashResponse)`
- `GetBackgroundComposerPullRequest(GetBackgroundComposerPullRequestRequest) returns (GetBackgroundComposerPullRequestResponse)`
- `RefreshGithubAccessTokenInBackgroundComposer(RefreshGithubAccessTokenInBackgroundComposerRequest) returns (RefreshGithubAccessTokenInBackgroundComposerResponse)`
- `CreateBackgroundComposerPod(CreateBackgroundComposerPodRequest) returns (CreateBackgroundComposerPodResponse)`
- `AttachBackgroundComposerPod(AttachBackgroundComposerPodRequest) returns (stream AttachBackgroundComposerPodResponse)`
- `CreateBackgroundComposerPodSnapshot(CreateBackgroundComposerPodSnapshotRequest) returns (CreateBackgroundComposerPodSnapshotResponse)`
- `ChangeBackgroundComposerSnapshotVisibility(ChangeBackgroundComposerSnapshotVisibilityRequest) returns (ChangeBackgroundComposerSnapshotVisibilityResponse)`
- `GetBackgroundComposerSnapshotInfo(GetBackgroundComposerSnapshotInfoRequest) returns (GetBackgroundComposerSnapshotInfoResponse)`
- `ListBackgroundComposerSnapshotsByBcId(ListBackgroundComposerSnapshotsByBcIdRequest) returns (ListBackgroundComposerSnapshotsByBcIdResponse)`
- `ListBackgroundComposerSnapshotStatusesByBcIds(ListBackgroundComposerSnapshotStatusesByBcIdsRequest) returns (ListBackgroundComposerSnapshotStatusesByBcIdsResponse)`
- `GetBackgroundComposerSnapshotState(GetBackgroundComposerSnapshotStateRequest) returns (GetBackgroundComposerSnapshotStateResponse)`
- `WatchBackgroundComposerSnapshotState(WatchBackgroundComposerSnapshotStateRequest) returns (stream WatchBackgroundComposerSnapshotStateResponse)`
- `GetBackgroundComposerConversation(GetBackgroundComposerConversationRequest) returns (GetBackgroundComposerConversationResponse)`
- `RenameBackgroundComposer(RenameBackgroundComposerRequest) returns (RenameBackgroundComposerResponse)`
- `CommitBackgroundComposer(CommitBackgroundComposerRequest) returns (CommitBackgroundComposerResponse)`
- `SetPersonalEnvironmentJson(SetPersonalEnvironmentJsonRequest) returns (SetPersonalEnvironmentJsonResponse)`
- `GetPersonalEnvironmentJson(GetPersonalEnvironmentJsonRequest) returns (GetPersonalEnvironmentJsonResponse)`
- `GetEnvironmentJsonCandidates(GetEnvironmentJsonCandidatesRequest) returns (GetEnvironmentJsonCandidatesResponse)`
- `ListPersonalEnvironments(ListPersonalEnvironmentsRequest) returns (ListPersonalEnvironmentsResponse)`
- `DeletePersonalEnvironmentJson(DeletePersonalEnvironmentJsonRequest) returns (DeletePersonalEnvironmentJsonResponse)`
- `PublishEnvironment(PublishEnvironmentRequest) returns (PublishEnvironmentResponse)`
- `PublishPersonalEnvironment(PublishPersonalEnvironmentRequest) returns (PublishPersonalEnvironmentResponse)`
- `ListTeamEnvironments(ListTeamEnvironmentsRequest) returns (ListTeamEnvironmentsResponse)`
- `DeleteTeamEnvironment(DeleteTeamEnvironmentRequest) returns (DeleteTeamEnvironmentResponse)`
- `SetTeamEnvironmentJson(SetTeamEnvironmentJsonRequest) returns (SetTeamEnvironmentJsonResponse)`
- `RestoreEnvironmentVersion(RestoreEnvironmentVersionRequest) returns (RestoreEnvironmentVersionResponse)`
- `ListEnvironments(ListEnvironmentsRequest) returns (ListEnvironmentsResponse)`
- `ResolveOrCreateMultiRepoEnvironment(ResolveOrCreateMultiRepoEnvironmentRequest) returns (ResolveOrCreateMultiRepoEnvironmentResponse)`
- `ResolveOrCreateDraftEnvironment(ResolveOrCreateDraftEnvironmentRequest) returns (ResolveOrCreateDraftEnvironmentResponse)`
- `SnapshotAndSaveEnvironment(SnapshotAndSaveEnvironmentRequest) returns (SnapshotAndSaveEnvironmentResponse)`
- `ListReposWithLocalEnvironment(ListReposWithLocalEnvironmentRequest) returns (ListReposWithLocalEnvironmentResponse)`
- `MarkBackgroundComposerRead(MarkBackgroundComposerReadRequest) returns (MarkBackgroundComposerReadResponse)`
- `MarkBackgroundComposerUnread(MarkBackgroundComposerUnreadRequest) returns (MarkBackgroundComposerUnreadResponse)`
- `NotifyBackgroundComposerShown(NotifyBackgroundComposerShownRequest) returns (NotifyBackgroundComposerShownResponse)`
- `FetchBackgroundComposer(FetchBackgroundComposerRequest) returns (FetchBackgroundComposerResponse)`
- `GetTurnSummaryBackgroundComposer(GetTurnSummaryBackgroundComposerRequest) returns (GetTurnSummaryBackgroundComposerResponse)`
- `GetBackgroundComposerName(GetBackgroundComposerNameRequest) returns (GetBackgroundComposerNameResponse)`
- `GetBackgroundComposerPrompt(GetBackgroundComposerPromptRequest) returns (GetBackgroundComposerPromptResponse)`
- `ReadBinaryFile(ReadBinaryFileRequest) returns (ReadBinaryFileResponse)`
- `ListBackgroundComposerArtifacts(ListBackgroundComposerArtifactsRequest) returns (ListBackgroundComposerArtifactsResponse)`
- `GetBackgroundComposerArtifact(GetBackgroundComposerArtifactRequest) returns (GetBackgroundComposerArtifactResponse)`
- `GetBackgroundComposerArtifactBytes(GetBackgroundComposerArtifactBytesRequest) returns (GetBackgroundComposerArtifactBytesResponse)`
- `StreamBackgroundComposerArtifact(StreamBackgroundComposerArtifactRequest) returns (stream StreamBackgroundComposerArtifactResponse)`
- `ListSharedBackgroundComposerArtifacts(ListSharedBackgroundComposerArtifactsRequest) returns (ListSharedBackgroundComposerArtifactsResponse)`
- `ShareBackgroundComposerArtifact(ShareBackgroundComposerArtifactRequest) returns (ShareBackgroundComposerArtifactResponse)`
- `UnshareBackgroundComposerArtifact(UnshareBackgroundComposerArtifactRequest) returns (UnshareBackgroundComposerArtifactResponse)`
- `GetPublicBackgroundComposerArtifact(GetPublicBackgroundComposerArtifactRequest) returns (GetPublicBackgroundComposerArtifactResponse)`
- `UpdateBackgroundComposerUserSettings(UpdateBackgroundComposerUserSettingsRequest) returns (UpdateBackgroundComposerUserSettingsResponse)`
- `GetBackgroundComposerUserSettings(GetBackgroundComposerUserSettingsRequest) returns (GetBackgroundComposerUserSettingsResponse)`
- `UpdateBackgroundComposerEnvironment(UpdateBackgroundComposerEnvironmentRequest) returns (UpdateBackgroundComposerEnvironmentResponse)`
- `GetRepositoryBranches(GetRepositoryBranchesRequest) returns (GetRepositoryBranchesResponse)`
- `GetPullRequestMergeStatus(GetPullRequestMergeStatusRequest) returns (GetPullRequestMergeStatusResponse)`
- `GetDetailedPullRequestStatus(GetDetailedPullRequestStatusRequest) returns (GetDetailedPullRequestStatusResponse)`
- `CheckPullRequestMergeability(CheckPullRequestMergeabilityRequest) returns (CheckPullRequestMergeabilityResponse)`
- `GetPullRequestDiscussions(GetPullRequestDiscussionsRequest) returns (GetPullRequestDiscussionsResponse)`
- `GetPullRequestCommits(GetPullRequestCommitsRequest) returns (GetPullRequestCommitsResponse)`
- `GetPullRequestTimelineEvents(GetPullRequestTimelineEventsRequest) returns (GetPullRequestTimelineEventsResponse)`
- `ReplyToReviewThread(ReplyToReviewThreadRequest) returns (ReplyToReviewThreadResponse)`
- `ResolveReviewThread(ResolveReviewThreadRequest) returns (ResolveReviewThreadResponse)`
- `UnresolveReviewThread(UnresolveReviewThreadRequest) returns (UnresolveReviewThreadResponse)`
- `DeletePullRequestReviewComment(DeletePullRequestReviewCommentRequest) returns (DeletePullRequestReviewCommentResponse)`
- `AddPullRequestReviewComment(AddPullRequestReviewCommentRequest) returns (AddPullRequestReviewCommentResponse)`
- `MergePullRequest(MergePullRequestRequest) returns (MergePullRequestResponse)`
- `EnablePullRequestAutoMerge(EnablePullRequestAutoMergeRequest) returns (EnablePullRequestAutoMergeResponse)`
- `DisablePullRequestAutoMerge(DisablePullRequestAutoMergeRequest) returns (DisablePullRequestAutoMergeResponse)`
- `ConvertPullRequestFromDraft(ConvertPullRequestFromDraftRequest) returns (ConvertPullRequestFromDraftResponse)`
- `UpdatePullRequestBranch(UpdatePullRequestBranchRequest) returns (UpdatePullRequestBranchResponse)`
- `RegisterPushNotificationToken(RegisterPushNotificationTokenRequest) returns (RegisterPushNotificationTokenResponse)`
- `DeletePushNotificationToken(DeletePushNotificationTokenRequest) returns (DeletePushNotificationTokenResponse)`
- `VerifyBackgroundComposerAccess(VerifyBackgroundComposerAccessRequest) returns (VerifyBackgroundComposerAccessResponse)`
- `StartSlackStreamingForFollowup(StartSlackStreamingForFollowupRequest) returns (StartSlackStreamingForFollowupResponse)`
- `StartGithubStreamingForFollowup(StartGithubStreamingForFollowupRequest) returns (StartGithubStreamingForFollowupResponse)`
- `StartLinearStreamingForFollowup(StartLinearStreamingForFollowupRequest) returns (StartLinearStreamingForFollowupResponse)`
- `GetGithubInstallations(GetGithubInstallationsRequest) returns (GetGithubInstallationsResponse)`
- `FetchAllInstallationRepos(FetchAllInstallationReposRequest) returns (FetchAllInstallationReposResponse)`
- `GetBackgroundComposerVmUsage(GetBackgroundComposerVmUsageRequest) returns (GetBackgroundComposerVmUsageResponse)`
- `ListGrindModeComposers(ListGrindModeComposersRequest) returns (ListGrindModeComposersResponse)`
- `GetCloudAgentDebugDetails(GetCloudAgentDebugDetailsRequest) returns (GetCloudAgentDebugDetailsResponse)`
- `GetCloudAgentMemoryDbLogs(GetCloudAgentMemoryDbLogsRequest) returns (GetCloudAgentMemoryDbLogsResponse)`
- `CreateAgentShare(CreateAgentShareRequest) returns (CreateAgentShareResponse)`
- `GetAgentSharePreview(GetAgentSharePreviewRequest) returns (GetAgentSharePreviewResponse)`
- `ListPrivateWorkers(ListPrivateWorkersRequest) returns (ListPrivateWorkersResponse)`
- `ListPendingPrivateWorkerRequests(ListPendingPrivateWorkerRequestsRequest) returns (ListPendingPrivateWorkerRequestsResponse)`
- `GetPrivateWorkersSummary(GetPrivateWorkersSummaryRequest) returns (GetPrivateWorkersSummaryResponse)`
- `GetPrivateWorker(GetPrivateWorkerRequest) returns (GetPrivateWorkerResponse)`
- `ReleasePrivateWorker(ReleasePrivateWorkerRequest) returns (ReleasePrivateWorkerResponse)`
- `BatchRefreshPullRequestStatus(BatchRefreshPullRequestStatusRequest) returns (BatchRefreshPullRequestStatusResponse)`
- `ListAgentStores(ListAgentStoresRequest) returns (ListAgentStoresResponse)`
- `ListAgentStoreEntries(ListAgentStoreEntriesRequest) returns (ListAgentStoreEntriesResponse)`
- `ReadAgentStoreFile(ReadAgentStoreFileRequest) returns (ReadAgentStoreFileResponse)`
- `MintAgentStoreToken(MintAgentStoreTokenRequest) returns (MintAgentStoreTokenResponse)`
- `ListAgentStoreFiles(ListAgentStoreFilesRequest) returns (ListAgentStoreFilesResponse)`
- `PresignAgentStoreReads(PresignAgentStoreReadsRequest) returns (PresignAgentStoreReadsResponse)`
- `PresignAgentStoreWrites(PresignAgentStoreWritesRequest) returns (PresignAgentStoreWritesResponse)`
- `ShareAgentStore(ShareAgentStoreRequest) returns (ShareAgentStoreResponse)`
- `UnshareAgentStore(UnshareAgentStoreRequest) returns (UnshareAgentStoreResponse)`
- `ListSharedAgentStores(ListSharedAgentStoresRequest) returns (ListSharedAgentStoresResponse)`

### `aiserver.v1.BidiService`

- `BidiAppend(BidiAppendRequest) returns (BidiAppendResponse)`

### `aiserver.v1.BugbotAdminService`

- `GetTeamTrialEnd(GetTeamTrialEndRequest) returns (GetTeamTrialEndResponse)`
- `SetTeamTrialEnd(SetTeamTrialEndRequest) returns (SetTeamTrialEndResponse)`
- `GetProUserTrialEnd(GetProUserTrialEndRequest) returns (GetProUserTrialEndResponse)`
- `SetProUserTrialEnd(SetProUserTrialEndRequest) returns (SetProUserTrialEndResponse)`
- `GetRepoNodeId(GetRepoNodeIdRequest) returns (GetRepoNodeIdResponse)`

### `aiserver.v1.BugbotService`

- `LogDeeplinkEvent(LogDeeplinkEventRequest) returns (LogDeeplinkEventResponse)`
- `GetEncryptedBugData(GetEncryptedBugDataRequest) returns (GetEncryptedBugDataResponse)`
- `GetEncryptedBugDataMultiple(GetEncryptedBugDataMultipleRequest) returns (GetEncryptedBugDataMultipleResponse)`
- `AddBugbotFeedback(AddBugbotFeedbackRequest) returns (AddBugbotFeedbackResponse)`
- `GetBugBotRunEta(GetBugBotRunEtaRequest) returns (GetBugBotRunEtaResponse)`

### `aiserver.v1.ChatRequestEventService`

- `SubmitChatRequestEvents(SubmitChatRequestEventsRequest) returns (SubmitChatRequestEventsResponse)`

### `aiserver.v1.ChatRequestEventV2Service`

- `SubmitChatRequestEventsV2(SubmitChatRequestEventsV2Request) returns (SubmitChatRequestEventsV2Response)`

### `aiserver.v1.ChatService`

- `StreamUnifiedChat(StreamUnifiedChatRequest) returns (stream StreamUnifiedChatResponse)`
- `StreamUnifiedChatWithTools(StreamUnifiedChatRequestWithTools) returns (StreamUnifiedChatResponseWithTools)`
- `StreamUnifiedChatWithToolsSSE(BidiRequestId) returns (stream StreamUnifiedChatResponseWithTools)`
- `StreamUnifiedChatWithToolsPoll(BidiPollRequest) returns (stream BidiPollResponse)`
- `StreamUnifiedChatWithToolsIdempotent(StreamUnifiedChatRequestWithToolsIdempotent) returns (StreamUnifiedChatResponseWithToolsIdempotent)`
- `StreamUnifiedChatWithToolsIdempotentSSE(BidiRequestId) returns (stream StreamUnifiedChatResponseWithToolsIdempotent)`
- `StreamUnifiedChatWithToolsIdempotentPoll(BidiPollRequest) returns (stream BidiPollResponse)`
- `GetConversationSummary(StreamUnifiedChatRequest) returns (ConversationSummary)`
- `StreamSpeculativeSummaries(StreamUnifiedChatRequest) returns (stream ConversationSummary)`
- `WarmStreamUnifiedChatWithTools(StreamUnifiedChatRequest) returns (WarmStreamUnifiedChatWithToolsResponse)`
- `GetPromptDryRun(StreamUnifiedChatRequest) returns (GetPromptDryRunResponse)`
- `StreamFullFileCmdK(StreamUnifiedChatRequest) returns (stream StreamUnifiedChatResponseWithTools)`
- `WarmFullFileCmdK(StreamUnifiedChatRequest) returns (WarmStreamUnifiedChatWithToolsResponse)`
- `ConvertOALToNAL(ConvertOALToNALRequest) returns (ConvertOALToNALResponse)`

### `aiserver.v1.CiMetricsService`

- `RecordPerformanceData(RecordPerformanceDataRequest) returns (RecordPerformanceDataResponse)`
- `UpsertInvocation(UpsertInvocationRequest) returns (UpsertInvocationResponse)`
- `RecordPerformanceChunk(RecordPerformanceChunkRequest) returns (RecordPerformanceChunkResponse)`
- `RecordInvocationWithData(RecordInvocationWithDataRequest) returns (RecordInvocationWithDataResponse)`
- `UpdateInvocationStatus(UpdateInvocationStatusRequest) returns (UpdateInvocationStatusResponse)`

### `aiserver.v1.ClientLoggerService`

- `GetDebuggingDataUploadUrl(GetDebuggingDataUploadUrlRequest) returns (GetDebuggingDataUploadUrlResponse)`
- `LogWhenTabTurnsOff(LogWhenTabTurnsOffRequest) returns (LogWhenTabTurnsOffResponse)`

### `aiserver.v1.CmdKService`

- `StreamCmdK(StreamCmdKRequest) returns (stream StreamCmdKResponseContextWrapped)`
- `StreamHypermode(StreamHypermodeRequest) returns (stream StreamCmdKResponseContextWrapped)`
- `RerankCmdKContext(RerankCmdKContextRequest) returns (RerankCmdKContextResponse)`
- `StreamTerminalCmdK(StreamTerminalCmdKRequest) returns (stream StreamTerminalCmdKResponseContextWrapped)`
- `RerankTerminalCmdKContext(RerankTerminalCmdKContextRequest) returns (RerankTerminalCmdKContextResponse)`
- `GetRelevantChunks(GetRelevantChunksRequest) returns (stream StreamGetRelevantChunksResponseContextWrapped)`

### `aiserver.v1.CodebaseSnapshotService`

- `RegisterCodebase(RegisterCodebaseRequest) returns (RegisterCodebaseResponse)`
- `RegisterCodebaseSnapshot(RegisterCodebaseSnapshotRequest) returns (RegisterCodebaseSnapshotResponse)`
- `GetCodebaseSnapshotStatus(GetCodebaseSnapshotStatusRequest) returns (GetCodebaseSnapshotStatusResponse)`
- `CreatePackfileUpload(CreatePackfileUploadRequest) returns (CreatePackfileUploadResponse)`
- `CompletePackfileUpload(CompletePackfileUploadRequest) returns (CompletePackfileUploadResponse)`
- `UploadPackfileChunk(UploadPackfileChunkRequest) returns (UploadPackfileChunkResponse)`

### `aiserver.v1.ConversationsService`

- `GetCommitMetrics(GetCommitMetricsRequest) returns (GetCommitMetricsResponse)`
- `GetCommitMetricsByFilePath(GetCommitMetricsByFilePathRequest) returns (GetCommitMetricsResponse)`

### `aiserver.v1.CppService`

- `MarkCppForEval(MarkCppRequest) returns (MarkCppResponse)`
- `StreamHoldCpp(StreamHoldCppRequest) returns (stream StreamHoldCppResponse)`
- `AvailableModels(AvailableCppModelsRequest) returns (AvailableCppModelsResponse)`
- `RecordCppFate(RecordCppFateRequest) returns (RecordCppFateResponse)`
- `AddTabRequestToEval(AddTabRequestToEvalRequest) returns (AddTabRequestToEvalResponse)`

### `aiserver.v1.CursorPredictionService`

- `CursorPredictionConfig(CursorPredictionConfigRequest) returns (CursorPredictionConfigResponse)`

### `aiserver.v1.DashboardService`

- `GetTeams(GetTeamsRequest) returns (GetTeamsResponse)`
- `GetMe(GetMeRequest) returns (GetMeResponse)`
- `GetAgenticOnboardingConfig(GetAgenticOnboardingConfigRequest) returns (GetAgenticOnboardingConfigResponse)`
- `GetUserOrganizations(GetUserOrganizationsRequest) returns (GetUserOrganizationsResponse)`
- `SetUserDefaultTeam(SetUserDefaultTeamRequest) returns (SetUserDefaultTeamResponse)`
- `GetOrganizationMembers(GetOrganizationMembersRequest) returns (GetOrganizationMembersResponse)`
- `ListOrganizationIdentityProviders(ListOrganizationIdentityProvidersRequest) returns (ListOrganizationIdentityProvidersResponse)`
- `UpdateOrganizationIdentityProviderSsoSettings(UpdateOrganizationIdentityProviderSsoSettingsRequest) returns (UpdateOrganizationIdentityProviderResponse)`
- `SetOrganizationIdentityProviderAllowDomainJoin(SetOrganizationIdentityProviderAllowDomainJoinRequest) returns (UpdateOrganizationIdentityProviderResponse)`
- `AddOrganizationIdentityProviderDomainJoin(AddOrganizationIdentityProviderDomainJoinRequest) returns (UpdateOrganizationIdentityProviderResponse)`
- `RemoveOrganizationIdentityProviderDomainJoin(RemoveOrganizationIdentityProviderDomainJoinRequest) returns (UpdateOrganizationIdentityProviderResponse)`
- `MoveOrganizationMemberToTeam(MoveOrganizationMemberToTeamRequest) returns (MoveOrganizationMemberToTeamResponse)`
- `SetOrganizationMemberTeams(SetOrganizationMemberTeamsRequest) returns (SetOrganizationMemberTeamsResponse)`
- `BulkMoveOrganizationMembers(BulkMoveOrganizationMembersRequest) returns (BulkMoveOrganizationMembersResponse)`
- `SetOrganizationMemberRole(SetOrganizationMemberRoleRequest) returns (SetOrganizationMemberRoleResponse)`
- `UpdateOrganizationTeam(UpdateOrganizationTeamRequest) returns (UpdateOrganizationTeamResponse)`
- `CreateOrganizationTeam(CreateOrganizationTeamRequest) returns (CreateOrganizationTeamResponse)`
- `GetOrganizationTeamAdminCandidates(GetOrganizationTeamAdminCandidatesRequest) returns (GetOrganizationTeamAdminCandidatesResponse)`
- `GetDirectoryGroups(GetDirectoryGroupsRequest) returns (GetDirectoryGroupsResponse)`
- `UpdateDirectoryGroupSettings(UpdateDirectoryGroupSettingsRequest) returns (UpdateDirectoryGroupSettingsResponse)`
- `GetOrganizationGroups(GetOrganizationGroupsRequest) returns (GetOrganizationGroupsResponse)`
- `GetOrganizationGroup(GetOrganizationGroupRequest) returns (GetOrganizationGroupResponse)`
- `GetOrganizationGroupMembers(GetOrganizationGroupMembersRequest) returns (GetOrganizationGroupMembersResponse)`
- `CreateOrganizationGroup(CreateOrganizationGroupRequest) returns (CreateOrganizationGroupResponse)`
- `UpdateOrganizationGroup(UpdateOrganizationGroupRequest) returns (UpdateOrganizationGroupResponse)`
- `DeleteOrganizationGroup(DeleteOrganizationGroupRequest) returns (DeleteOrganizationGroupResponse)`
- `AddOrganizationGroupMembers(AddOrganizationGroupMembersRequest) returns (AddOrganizationGroupMembersResponse)`
- `RemoveOrganizationGroupMembers(RemoveOrganizationGroupMembersRequest) returns (RemoveOrganizationGroupMembersResponse)`
- `UpdateOrganizationGroupMember(UpdateOrganizationGroupMemberRequest) returns (UpdateOrganizationGroupMemberResponse)`
- `GetOrganizationGroupAutorunSettings(GetOrganizationGroupAutorunSettingsRequest) returns (GetOrganizationGroupAutorunSettingsResponse)`
- `UpdateOrganizationGroupAutorunSettings(UpdateOrganizationGroupAutorunSettingsRequest) returns (UpdateOrganizationGroupAutorunSettingsResponse)`
- `GetOrganizationGroupModelAllowlist(GetOrganizationGroupModelAllowlistRequest) returns (GetOrganizationGroupModelAllowlistResponse)`
- `UpdateOrganizationGroupModelAllowlist(UpdateOrganizationGroupModelAllowlistRequest) returns (UpdateOrganizationGroupModelAllowlistResponse)`
- `GetGroups(GetGroupsRequest) returns (GetGroupsResponse)`
- `GetGroupMembers(GetGroupMembersRequest) returns (GetGroupMembersResponse)`
- `CreateGroup(CreateGroupRequest) returns (CreateGroupResponse)`
- `UpdateGroup(UpdateGroupRequest) returns (UpdateGroupResponse)`
- `DeleteGroup(DeleteGroupRequest) returns (DeleteGroupResponse)`
- `AddGroupMembers(AddGroupMembersRequest) returns (AddGroupMembersResponse)`
- `RemoveGroupMembers(RemoveGroupMembersRequest) returns (RemoveGroupMembersResponse)`
- `BulkAssignGroupMembers(BulkAssignGroupMembersRequest) returns (BulkAssignGroupMembersResponse)`
- `PreviewAttachGroupToDirectory(PreviewAttachGroupToDirectoryRequest) returns (PreviewAttachGroupToDirectoryResponse)`
- `DetachGroupFromDirectory(DetachGroupFromDirectoryRequest) returns (DetachGroupFromDirectoryResponse)`
- `GetScimConflicts(GetScimConflictsRequest) returns (GetScimConflictsResponse)`
- `ListScimDirectories(ListScimDirectoriesRequest) returns (ListScimDirectoriesResponse)`
- `GetOrganizationScimConfigurationLinks(ListScimDirectoriesRequest) returns (GetOrganizationScimConfigurationLinksResponse)`
- `CreateScimDirectory(CreateScimDirectoryRequest) returns (CreateScimDirectoryResponse)`
- `DeleteScimDirectory(DeleteScimDirectoryRequest) returns (DeleteScimDirectoryResponse)`
- `ListScimGroupsFromUpstream(ListScimGroupsFromUpstreamRequest) returns (ListScimGroupsFromUpstreamResponse)`
- `ListScimTargetMappings(ListScimTargetMappingsRequest) returns (ListScimTargetMappingsResponse)`
- `CreateScimTargetMapping(CreateScimTargetMappingRequest) returns (CreateScimTargetMappingResponse)`
- `DeleteScimTargetMapping(DeleteScimTargetMappingRequest) returns (DeleteScimTargetMappingResponse)`
- `GetActivationCheckoutUrl(GetActivationCheckoutUrlRequest) returns (GetActivationCheckoutUrlResponse)`
- `CheckPromotionEligibility(CheckPromotionEligibilityRequest) returns (CheckPromotionEligibilityResponse)`
- `ActivatePromotion(ActivatePromotionRequest) returns (ActivatePromotionResponse)`
- `GetTeamCustomerPortalUrl(GetTeamCustomerPortalUrlRequest) returns (GetTeamCustomerPortalUrlResponse)`
- `GetTeamMembers(GetTeamMembersRequest) returns (GetTeamMembersResponse)`
- `SendTeamInvite(SendTeamInviteRequest) returns (SendTeamInviteResponse)`
- `GetTeamInviteLink(GetTeamInviteLinkRequest) returns (GetTeamInviteLinkResponse)`
- `AcceptInvite(AcceptInviteRequest) returns (AcceptInviteResponse)`
- `GetTeamInviteMetadata(GetTeamInviteMetadataRequest) returns (GetTeamInviteMetadataResponse)`
- `ListContactImportConnections(ListContactImportConnectionsRequest) returns (ListContactImportConnectionsResponse)`
- `GetGoogleContactImportAuthUrl(GetGoogleContactImportAuthUrlRequest) returns (GetGoogleContactImportAuthUrlResponse)`
- `ConnectGoogleContactImportCallback(ConnectGoogleContactImportCallbackRequest) returns (ConnectGoogleContactImportCallbackResponse)`
- `ListContactImportContacts(ListContactImportContactsRequest) returns (ListContactImportContactsResponse)`
- `GetContactImportAvatar(GetContactImportAvatarRequest) returns (GetContactImportAvatarResponse)`
- `DisconnectContactImportConnection(DisconnectContactImportConnectionRequest) returns (DisconnectContactImportConnectionResponse)`
- `CreateTeam(CreateTeamRequest) returns (CreateTeamResponse)`
- `GetJoinableTeamsByDomain(GetJoinableTeamsByDomainRequest) returns (GetJoinableTeamsByDomainResponse)`
- `JoinTeamByDomain(JoinTeamByDomainRequest) returns (JoinTeamByDomainResponse)`
- `UpdateTeamDomainJoinSetting(UpdateTeamDomainJoinSettingRequest) returns (UpdateTeamDomainJoinSettingResponse)`
- `GetTeamMemberDomains(GetTeamMemberDomainsRequest) returns (GetTeamMemberDomainsResponse)`
- `GetTeamIdForReactivation(GetTeamIdForReactivationRequest) returns (GetTeamIdForReactivationResponse)`
- `ChangeSeat(ChangeSeatRequest) returns (ChangeSeatResponse)`
- `ChangeTeamSubscription(ChangeTeamSubscriptionRequest) returns (ChangeTeamSubscriptionResponse)`
- `ConnectGithubCallback(ConnectGithubCallbackRequest) returns (ConnectGithubCallbackResponse)`
- `RegisterGithubCursorCode(RegisterGithubCursorCodeRequest) returns (RegisterGithubCursorCodeResponse)`
- `PrepareGithubConnectFlow(PrepareGithubConnectFlowRequest) returns (PrepareGithubConnectFlowResponse)`
- `CompleteGithubConnectFlow(CompleteGithubConnectFlowRequest) returns (CompleteGithubConnectFlowResponse)`
- `DisconnectGithub(DisconnectGithubRequest) returns (DisconnectGithubResponse)`
- `PrepareSetupGithubEnterpriseApp(PrepareSetupGithubEnterpriseAppRequest) returns (PrepareSetupGithubEnterpriseAppResponse)`
- `FinishSetupGithubEnterpriseApp(FinishSetupGithubEnterpriseAppRequest) returns (FinishSetupGithubEnterpriseAppResponse)`
- `ListGithubEnterpriseApps(ListGithubEnterpriseAppsRequest) returns (ListGithubEnterpriseAppsResponse)`
- `DeleteGithubEnterpriseApp(DeleteGithubEnterpriseAppRequest) returns (DeleteGithubEnterpriseAppResponse)`
- `SetupGitlabEnterpriseInstance(SetupGitlabEnterpriseInstanceRequest) returns (SetupGitlabEnterpriseInstanceResponse)`
- `ListGitlabEnterpriseInstances(ListGitlabEnterpriseInstancesRequest) returns (ListGitlabEnterpriseInstancesResponse)`
- `SetGitlabEnterpriseHostControlledServiceAccountToken(SetGitlabEnterpriseHostControlledServiceAccountTokenRequest) returns (SetGitlabEnterpriseHostControlledServiceAccountTokenResponse)`
- `RotateGitlabEnterpriseWebhookSecret(RotateGitlabEnterpriseWebhookSecretRequest) returns (RotateGitlabEnterpriseWebhookSecretResponse)`
- `DeleteGitlabEnterpriseInstance(DeleteGitlabEnterpriseInstanceRequest) returns (DeleteGitlabEnterpriseInstanceResponse)`
- `SyncGitlabRepos(SyncGitlabReposRequest) returns (SyncGitlabReposResponse)`
- `UpdateRole(UpdateRoleRequest) returns (UpdateRoleResponse)`
- `RemoveMember(RemoveMemberRequest) returns (RemoveMemberResponse)`
- `GetMemberRemovalInsights(GetMemberRemovalInsightsRequest) returns (GetMemberRemovalInsightsResponse)`
- `GetTeamUsage(GetTeamUsageRequest) returns (GetTeamUsageResponse)`
- `GetSignUpType(GetSignUpTypeRequest) returns (GetSignUpTypeResponse)`
- `GetHardLimit(GetHardLimitRequest) returns (GetHardLimitResponse)`
- `SetHardLimit(SetHardLimitRequest) returns (SetHardLimitResponse)`
- `GetSpendLimitPolicy(GetSpendLimitPolicyRequest) returns (GetSpendLimitPolicyResponse)`
- `SetSpendLimitPolicy(SetSpendLimitPolicyRequest) returns (SetSpendLimitPolicyResponse)`
- `GetOrgTeamBudgets(GetOrgTeamBudgetsRequest) returns (GetOrgTeamBudgetsResponse)`
- `SetOrgTeamBudget(SetOrgTeamBudgetRequest) returns (SetOrgTeamBudgetResponse)`
- `GetOrgDailySpendByCategory(GetOrgDailySpendByCategoryRequest) returns (GetDailySpendByCategoryResponse)`
- `EnableOnDemandSpend(EnableOnDemandSpendRequest) returns (EnableOnDemandSpendResponse)`
- `DeleteAccount(DeleteAccountRequest) returns (DeleteAccountResponse)`
- `SendDownloadEmail(SendDownloadEmailRequest) returns (SendDownloadEmailResponse)`
- `GetMonthlyInvoice(GetMonthlyInvoiceRequest) returns (GetMonthlyInvoiceResponse)`
- `ListInvoiceCycles(ListInvoiceCyclesRequest) returns (ListInvoiceCyclesResponse)`
- `GetDailySpendByCategory(GetDailySpendByCategoryRequest) returns (GetDailySpendByCategoryResponse)`
- `GetPricingHistory(GetPricingHistoryRequest) returns (GetPricingHistoryResponse)`
- `ListBackgroundComposerSecrets(ListBackgroundComposerSecretsRequest) returns (ListBackgroundComposerSecretsResponse)`
- `CreateBackgroundComposerSecret(CreateBackgroundComposerSecretRequest) returns (CreateBackgroundComposerSecretResponse)`
- `CreateBackgroundComposerSecretBatch(CreateBackgroundComposerSecretBatchRequest) returns (CreateBackgroundComposerSecretBatchResponse)`
- `RevokeBackgroundComposerSecret(RevokeBackgroundComposerSecretRequest) returns (RevokeBackgroundComposerSecretResponse)`
- `UpdateBackgroundComposerSecret(UpdateBackgroundComposerSecretRequest) returns (UpdateBackgroundComposerSecretResponse)`
- `GetMcpConfig(GetMcpConfigRequest) returns (GetMcpConfigResponse)`
- `GetAvailableMcpServers(GetAvailableMcpServersRequest) returns (GetAvailableMcpServersResponse)`
- `GetMcpServerUsageSummary(GetMcpServerUsageSummaryRequest) returns (GetMcpServerUsageSummaryResponse)`
- `SetMcpConfig(SetMcpConfigRequest) returns (SetMcpConfigResponse)`
- `UpdateUserDefaultMcpSettings(UpdateUserDefaultMcpSettingsRequest) returns (UpdateUserDefaultMcpSettingsResponse)`
- `MarkMcpServersSeen(MarkMcpServersSeenRequest) returns (MarkMcpServersSeenResponse)`
- `StoreMcpOAuthToken(StoreMcpOAuthTokenRequest) returns (StoreMcpOAuthTokenResponse)`
- `GetMcpOAuthTokens(GetMcpOAuthTokensRequest) returns (GetMcpOAuthTokensResponse)`
- `McpOAuthRefreshLockBegin(McpOAuthRefreshLockBeginRequest) returns (McpOAuthRefreshLockBeginResponse)`
- `McpOAuthRefreshLockRelease(McpOAuthRefreshLockReleaseRequest) returns (McpOAuthRefreshLockReleaseResponse)`
- `DeleteMcpOAuthToken(DeleteMcpOAuthTokenRequest) returns (DeleteMcpOAuthTokenResponse)`
- `ValidateMcpOAuthTokens(ValidateMcpOAuthTokensRequest) returns (ValidateMcpOAuthTokensResponse)`
- `CheckHttpMcpStatus(CheckHttpMcpStatusRequest) returns (CheckHttpMcpStatusResponse)`
- `StoreMcpOAuthPendingState(StoreMcpOAuthPendingStateRequest) returns (StoreMcpOAuthPendingStateResponse)`
- `GetMcpOAuthPendingState(GetMcpOAuthPendingStateRequest) returns (GetMcpOAuthPendingStateResponse)`
- `CompleteMcpOAuth(CompleteMcpOAuthRequest) returns (CompleteMcpOAuthResponse)`
- `GetPluginMcpConfig(GetPluginMcpConfigRequest) returns (GetPluginMcpConfigResponse)`
- `BatchGetPluginMcpConfig(BatchGetPluginMcpConfigRequest) returns (BatchGetPluginMcpConfigResponse)`
- `AddMcpServersFromPlugin(AddMcpServersFromPluginRequest) returns (AddMcpServersFromPluginResponse)`
- `MoveUserMcpServerToTeam(MoveUserMcpServerToTeamRequest) returns (MoveUserMcpServerToTeamResponse)`
- `ProbeMcpUrl(ProbeMcpUrlRequest) returns (ProbeMcpUrlResponse)`
- `CreateTeamWithFreeTrial(CreateTeamWithFreeTrialRequest) returns (CreateTeamWithFreeTrialResponse)`
- `CreateTeamWithOrg(CreateTeamWithOrgRequest) returns (CreateTeamWithOrgResponse)`
- `GetTeamHasValidPaymentMethod(GetTeamHasValidPaymentMethodRequest) returns (GetTeamHasValidPaymentMethodResponse)`
- `GetTeamPrivacyModeForced(GetTeamPrivacyModeForcedRequest) returns (GetTeamPrivacyModeForcedResponse)`
- `SwitchTeamPrivacyMode(SwitchTeamPrivacyModeRequest) returns (SwitchTeamPrivacyModeResponse)`
- `UpdateFastRequests(UpdateFastRequestsRequest) returns (UpdateFastRequestsResponse)`
- `GetFastRequests(GetFastRequestsRequest) returns (GetFastRequestsResponse)`
- `GetDownloadLink(GetDownloadLinkRequest) returns (GetDownloadLinkResponse)`
- `GetCliDownloadUrl(GetCliDownloadUrlRequest) returns (GetCliDownloadUrlResponse)`
- `GetSsoConfigurationLinks(GetSsoConfigurationLinksRequest) returns (GetSsoConfigurationLinksResponse)`
- `GetScimConfigurationLinks(GetScimConfigurationLinksRequest) returns (GetScimConfigurationLinksResponse)`
- `SetAdminOnlyUsagePricing(SetAdminOnlyUsagePricingRequest) returns (SetAdminOnlyUsagePricingResponse)`
- `GetYearlyUpgradeEligibility(GetYearlyUpgradeEligibilityRequest) returns (GetYearlyUpgradeEligibilityResponse)`
- `UpgradeToYearly(UpgradeToYearlyRequest) returns (UpgradeToYearlyResponse)`
- `GetEnterpriseCTAEligibility(GetEnterpriseCTAEligibilityRequest) returns (GetEnterpriseCTAEligibilityResponse)`
- `GetUsageBasedPremiumRequests(GetUsageBasedPremiumRequestsRequest) returns (GetUsageBasedPremiumRequestsResponse)`
- `SetUsageBasedPremiumRequests(SetUsageBasedPremiumRequestsRequest) returns (SetUsageBasedPremiumRequestsResponse)`
- `GetReferrals(GetReferralsRequest) returns (GetReferralsResponse)`
- `GetReferralCodes(GetReferralCodesRequest) returns (GetReferralCodesResponse)`
- `CreateP2PReferralLink(CreateP2PReferralLinkRequest) returns (CreateP2PReferralLinkResponse)`
- `GetP2PReferralStatus(GetP2PReferralStatusRequest) returns (GetP2PReferralStatusResponse)`
- `SendP2PReferralInvites(SendP2PReferralInvitesRequest) returns (SendP2PReferralInvitesResponse)`
- `GetP2PReferralHistory(GetP2PReferralHistoryRequest) returns (GetP2PReferralHistoryResponse)`
- `CheckReferralAllowlist(CheckReferralAllowlistRequest) returns (CheckReferralAllowlistResponse)`
- `CheckReferralCode(CheckReferralCodeRequest) returns (CheckReferralCodeResponse)`
- `RedeemGiftCode(RedeemGiftCodeRequest) returns (RedeemGiftCodeResponse)`
- `GetTeamRepos(GetTeamReposRequest) returns (GetTeamReposResponse)`
- `GetTeamReposOrEmptyIfNotInTeam(GetTeamReposRequest) returns (GetTeamReposResponse)`
- `GetTeamRules(GetTeamRulesRequest) returns (GetTeamRulesResponse)`
- `CreateTeamRule(CreateTeamRuleRequest) returns (CreateTeamRuleResponse)`
- `UpdateTeamRule(UpdateTeamRuleRequest) returns (UpdateTeamRuleResponse)`
- `DeleteTeamRule(DeleteTeamRuleRequest) returns (DeleteTeamRuleResponse)`
- `GetTeamHooks(GetTeamHooksRequest) returns (GetTeamHooksResponse)`
- `CreateTeamHook(CreateTeamHookRequest) returns (CreateTeamHookResponse)`
- `UpdateTeamHook(UpdateTeamHookRequest) returns (UpdateTeamHookResponse)`
- `DeleteTeamHook(DeleteTeamHookRequest) returns (DeleteTeamHookResponse)`
- `GetTeamCommands(GetTeamCommandsRequest) returns (GetTeamCommandsResponse)`
- `CreateTeamCommand(CreateTeamCommandRequest) returns (CreateTeamCommandResponse)`
- `UpdateTeamCommand(UpdateTeamCommandRequest) returns (UpdateTeamCommandResponse)`
- `DeleteTeamCommand(DeleteTeamCommandRequest) returns (DeleteTeamCommandResponse)`
- `GetGlobalCommands(GetGlobalCommandsRequest) returns (GetGlobalCommandsResponse)`
- `GetRepoSlashCommands(GetRepoSlashCommandsRequest) returns (GetRepoSlashCommandsResponse)`
- `GetBackgroundComposerSlashCommands(GetBackgroundComposerSlashCommandsRequest) returns (GetBackgroundComposerSlashCommandsResponse)`
- `GetCloudAgentPluginsSnapshot(GetCloudAgentPluginsSnapshotRequest) returns (GetCloudAgentPluginsSnapshotResponse)`
- `GetBugbotTeamRules(GetBugbotTeamRulesRequest) returns (GetBugbotTeamRulesResponse)`
- `CreateBugbotTeamRule(CreateBugbotTeamRuleRequest) returns (CreateBugbotTeamRuleResponse)`
- `UpdateBugbotTeamRule(UpdateBugbotTeamRuleRequest) returns (UpdateBugbotTeamRuleResponse)`
- `DeleteBugbotTeamRule(DeleteBugbotTeamRuleRequest) returns (DeleteBugbotTeamRuleResponse)`
- `GetBugbotLearnedRules(GetBugbotLearnedRulesRequest) returns (GetBugbotLearnedRulesResponse)`
- `UpdateBugbotLearnedRule(UpdateBugbotLearnedRuleRequest) returns (UpdateBugbotLearnedRuleResponse)`
- `DeleteBugbotLearnedRule(DeleteBugbotLearnedRuleRequest) returns (DeleteBugbotLearnedRuleResponse)`
- `CreateBugbotManualRepositoryRule(CreateBugbotManualRepositoryRuleRequest) returns (CreateBugbotManualRepositoryRuleResponse)`
- `GetBugbotManualRepositoryRules(GetBugbotManualRepositoryRulesRequest) returns (GetBugbotManualRepositoryRulesResponse)`
- `UpdateBugbotManualRepositoryRule(UpdateBugbotManualRepositoryRuleRequest) returns (UpdateBugbotManualRepositoryRuleResponse)`
- `DeleteBugbotManualRepositoryRule(DeleteBugbotManualRepositoryRuleRequest) returns (DeleteBugbotManualRepositoryRuleResponse)`
- `RunDiamondToBugbotMigration(RunDiamondToBugbotMigrationRequest) returns (RunDiamondToBugbotMigrationResponse)`
- `GetBugbotRuleAnalytics(GetBugbotRuleAnalyticsRequest) returns (GetBugbotRuleAnalyticsResponse)`
- `GetBugbotRuleById(GetBugbotRuleByIdRequest) returns (GetBugbotRuleByIdResponse)`
- `CreateTeamRepo(CreateTeamRepoRequest) returns (CreateTeamRepoResponse)`
- `DeleteTeamRepo(DeleteTeamRepoRequest) returns (DeleteTeamRepoResponse)`
- `AddRepoPattern(AddRepoPatternRequest) returns (AddRepoPatternResponse)`
- `RemoveRepoPattern(RemoveRepoPatternRequest) returns (RemoveRepoPatternResponse)`
- `SetTeamRepoType(SetTeamRepoTypeRequest) returns (SetTeamRepoTypeResponse)`
- `GetTeamAdminSettings(GetTeamAdminSettingsRequest) returns (GetTeamAdminSettingsResponse)`
- `GetTeamAdminSettingsOrEmptyIfNotInTeam(GetTeamAdminSettingsRequest) returns (GetTeamAdminSettingsResponse)`
- `GetBaseTeamAdminSettings(GetBaseTeamAdminSettingsRequest) returns (GetTeamAdminSettingsResponse)`
- `UpdateTeamAdminSettings(UpdateTeamAdminSettingsRequest) returns (UpdateTeamAdminSettingsResponse)`
- `UpdateTeamInviteLinkTTLSetting(UpdateTeamInviteLinkTTLSettingRequest) returns (UpdateTeamInviteLinkTTLSettingResponse)`
- `GetProtectedGitScopes(GetProtectedGitScopesRequest) returns (GetProtectedGitScopesResponse)`
- `CreateProtectedGitScope(CreateProtectedGitScopeRequest) returns (CreateProtectedGitScopeResponse)`
- `DeleteProtectedGitScope(DeleteProtectedGitScopeRequest) returns (DeleteProtectedGitScopeResponse)`
- `CreateTeamFreeTrialCode(CreateTeamFreeTrialCodeRequest) returns (CreateTeamFreeTrialCodeResponse)`
- `GetTeamAnalytics(GetTeamAnalyticsRequest) returns (GetTeamAnalyticsResponse)`
- `GetUserAnalytics(GetUserAnalyticsRequest) returns (GetUserAnalyticsResponse)`
- `GetTeamRawData(GetTeamRawDataRequest) returns (GetTeamRawDataResponse)`
- `GetClientUsageData(GetClientUsageDataRequest) returns (GetClientUsageDataResponse)`
- `GetCurrentPeriodUsage(GetCurrentPeriodUsageRequest) returns (GetCurrentPeriodUsageResponse)`
- `GetPlanInfo(GetPlanInfoRequest) returns (GetPlanInfoResponse)`
- `GetCursorReviewEntitlement(GetCursorReviewEntitlementRequest) returns (GetCursorReviewEntitlementResponse)`
- `GetUsageLimitPolicyStatus(GetUsageLimitPolicyStatusRequest) returns (GetUsageLimitPolicyStatusResponse)`
- `GetUsageLimitStatusAndActiveGrants(GetUsageLimitStatusAndActiveGrantsRequest) returns (GetUsageLimitStatusAndActiveGrantsResponse)`
- `GetCreditGrantsBalance(GetCreditGrantsBalanceRequest) returns (GetCreditGrantsBalanceResponse)`
- `GetClientVisibleCreditGrants(GetClientVisibleCreditGrantsRequest) returns (GetClientVisibleCreditGrantsResponse)`
- `GetAdvancedAnalyticsEnabled(GetAdvancedAnalyticsEnabledRequest) returns (GetAdvancedAnalyticsEnabledResponse)`
- `GetTokenUsage(GetTokenUsageRequest) returns (GetTokenUsageResponse)`
- `ValidateBedrockIamRole(ValidateBedrockIamRoleRequest) returns (ValidateBedrockIamRoleResponse)`
- `CreateAnthropicCyberEnrollmentUrl(CreateAnthropicCyberEnrollmentUrlRequest) returns (CreateAnthropicCyberEnrollmentUrlResponse)`
- `AddUserToEarlyAccessList(AddUserToEarlyAccessListRequest) returns (AddUserToEarlyAccessListResponse)`
- `GetTeamSpend(GetTeamSpendRequest) returns (GetTeamSpendResponse)`
- `GetCurrentBillingCycle(GetCurrentBillingCycleRequest) returns (GetCurrentBillingCycleResponse)`
- `GetMonthlyBillingCycle(GetMonthlyBillingCycleRequest) returns (GetMonthlyBillingCycleResponse)`
- `GetBugbotSettings(GetBugbotSettingsRequest) returns (GetBugbotSettingsResponse)`
- `GetBugbotAnalyticsV2(GetBugbotAnalyticsV2Request) returns (GetBugbotAnalyticsV2Response)`
- `GetBugBotPRAnalytics(GetBugBotPRAnalyticsRequest) returns (GetBugBotPRAnalyticsResponse)`
- `GetGithubInstallations(GetGithubInstallationsRequest) returns (GetGithubInstallationsResponse)`
- `GetScmConnectionStatus(GetScmConnectionStatusRequest) returns (GetScmConnectionStatusResponse)`
- `GetInstallationRepos(GetInstallationReposRequest) returns (GetInstallationReposResponse)`
- `FetchAllInstallationRepos(FetchAllInstallationReposRequest) returns (FetchAllInstallationReposResponse)`
- `GetInstallationGithubUsers(GetInstallationGithubUsersRequest) returns (GetInstallationGithubUsersResponse)`
- `GetUserAdminOrganizations(GetUserAdminOrganizationsRequest) returns (GetUserAdminOrganizationsResponse)`
- `GetTeamGithubUsers(GetTeamGithubUsersRequest) returns (GetTeamGithubUsersResponse)`
- `AddGithubUsersToTeam(AddGithubUsersToTeamRequest) returns (AddGithubUsersToTeamResponse)`
- `GetUserPullRequests(GetUserPullRequestsRequest) returns (GetUserPullRequestsResponse)`
- `GetUserReviewRequests(GetUserReviewRequestsRequest) returns (GetUserReviewRequestsResponse)`
- `GetPullRequestForBranch(GetPullRequestForBranchRequest) returns (GetPullRequestForBranchResponse)`
- `UpdateGithubRepoSettings(UpdateGithubRepoSettingsRequest) returns (UpdateGithubRepoSettingsResponse)`
- `UpdateGithubInstallationSettings(UpdateGithubInstallationSettingsRequest) returns (UpdateGithubInstallationSettingsResponse)`
- `UpdateAllGithubRepoSettings(UpdateAllGithubRepoSettingsRequest) returns (UpdateAllGithubRepoSettingsResponse)`
- `UpdateGithubInstallationTeamScope(UpdateGithubInstallationTeamScopeRequest) returns (UpdateGithubInstallationTeamScopeResponse)`
- `UpdateSelfGithubAllowlist(UpdateSelfGithubAllowlistRequest) returns (UpdateSelfGithubAllowlistResponse)`
- `GetTeamBugbotSettings(GetTeamBugbotSettingsRequest) returns (GetTeamBugbotSettingsResponse)`
- `UpdateTeamBugbotSettings(UpdateTeamBugbotSettingsRequest) returns (UpdateTeamBugbotSettingsResponse)`
- `MigrateTeamBugbotToUsageBasedBilling(MigrateTeamBugbotToUsageBasedBillingRequest) returns (MigrateTeamBugbotToUsageBasedBillingResponse)`
- `GetBugbotMode(GetBugbotModeRequest) returns (GetBugbotModeResponse)`
- `UpdateBugbotMode(UpdateBugbotModeRequest) returns (UpdateBugbotModeResponse)`
- `GetBugbotUserSettings(GetBugbotUserSettingsRequest) returns (GetBugbotUserSettingsResponse)`
- `UpdateBugbotUserSettings(UpdateBugbotUserSettingsRequest) returns (UpdateBugbotUserSettingsResponse)`
- `GetFullSelfDrivingUserSettings(GetFullSelfDrivingUserSettingsRequest) returns (GetFullSelfDrivingUserSettingsResponse)`
- `UpdateFullSelfDrivingUserSettings(UpdateFullSelfDrivingUserSettingsRequest) returns (UpdateFullSelfDrivingUserSettingsResponse)`
- `ListFullSelfDrivingRepoSettings(ListFullSelfDrivingRepoSettingsRequest) returns (ListFullSelfDrivingRepoSettingsResponse)`
- `SetFullSelfDrivingRepoEnabled(SetFullSelfDrivingRepoEnabledRequest) returns (SetFullSelfDrivingRepoEnabledResponse)`
- `GetFullSelfDrivingTeamSettings(GetFullSelfDrivingTeamSettingsRequest) returns (GetFullSelfDrivingTeamSettingsResponse)`
- `UpdateFullSelfDrivingTeamSettings(UpdateFullSelfDrivingTeamSettingsRequest) returns (UpdateFullSelfDrivingTeamSettingsResponse)`
- `ListFullSelfDrivingTeamRepoSettings(ListFullSelfDrivingTeamRepoSettingsRequest) returns (ListFullSelfDrivingTeamRepoSettingsResponse)`
- `SetFullSelfDrivingTeamRepoEnabled(SetFullSelfDrivingTeamRepoEnabledRequest) returns (SetFullSelfDrivingTeamRepoEnabledResponse)`
- `ListFullSelfDrivingActiveAgents(ListFullSelfDrivingActiveAgentsRequest) returns (ListFullSelfDrivingActiveAgentsResponse)`
- `ListFullSelfDrivingTeamActiveAgents(ListFullSelfDrivingTeamActiveAgentsRequest) returns (ListFullSelfDrivingTeamActiveAgentsResponse)`
- `UpdateFullSelfDrivingPrConfig(UpdateFullSelfDrivingPrConfigRequest) returns (UpdateFullSelfDrivingPrConfigResponse)`
- `GetBugBotProUserSettings(GetBugBotProUserSettingsRequest) returns (GetBugBotProUserSettingsResponse)`
- `UpdateBugBotProUserSettings(UpdateBugBotProUserSettingsRequest) returns (UpdateBugBotProUserSettingsResponse)`
- `MigrateBugBotProUserToUsageBasedBilling(MigrateBugBotProUserToUsageBasedBillingRequest) returns (MigrateBugBotProUserToUsageBasedBillingResponse)`
- `GetGlassEarlyPreviewEnrollment(GetGlassEarlyPreviewEnrollmentRequest) returns (GetGlassEarlyPreviewEnrollmentResponse)`
- `EnrollInGlassEarlyPreview(EnrollInGlassEarlyPreviewRequest) returns (EnrollInGlassEarlyPreviewResponse)`
- `UnenrollFromGlassEarlyPreview(UnenrollFromGlassEarlyPreviewRequest) returns (UnenrollFromGlassEarlyPreviewResponse)`
- `RecordBugbotDeeplinkEvent(RecordBugbotDeeplinkEventRequest) returns (RecordBugbotDeeplinkEventResponse)`
- `RecordBugbotDeeplinkEventUnauthenticated(RecordBugbotDeeplinkEventRequest) returns (RecordBugbotDeeplinkEventResponse)`
- `RevokeBugBotLicenses(RevokeBugBotLicensesRequest) returns (RevokeBugBotLicensesResponse)`
- `RevokeUserBugbotLicense(RevokeUserBugbotLicenseRequest) returns (RevokeUserBugbotLicenseResponse)`
- `StartBugbotBackfillLearning(StartBugbotBackfillLearningRequest) returns (StartBugbotBackfillLearningResponse)`
- `GetBugbotBackfillStatus(GetBugbotBackfillStatusRequest) returns (GetBugbotBackfillStatusResponse)`
- `SetSlackAuth(SetSlackAuthRequest) returns (SetSlackAuthResponse)`
- `GetSlackTeamSettings(GetSlackTeamSettingsRequest) returns (GetSlackTeamSettingsResponse)`
- `UpdateSlackTeamSettings(UpdateSlackTeamSettingsRequest) returns (UpdateSlackTeamSettingsResponse)`
- `GetSlackSettings(GetSlackSettingsRequest) returns (GetSlackSettingsResponse)`
- `GetSlackModelOptions(GetSlackModelOptionsRequest) returns (GetSlackModelOptionsResponse)`
- `GetSlackInstallUrl(GetSlackInstallUrlRequest) returns (GetSlackInstallUrlResponse)`
- `GetSlackInstallUrlPublic(GetPublicSlackInstallUrlRequest) returns (GetPublicSlackInstallUrlResponse)`
- `GetSlackInstallUrlPublicWithUserScopes(GetPublicSlackInstallUrlWithUserScopesRequest) returns (GetPublicSlackInstallUrlWithUserScopesResponse)`
- `GetFilteredUsageEvents(GetFilteredUsageEventsRequest) returns (GetFilteredUsageEventsResponse)`
- `GetAggregatedUsageEvents(GetAggregatedUsageEventsRequest) returns (GetAggregatedUsageEventsResponse)`
- `GetAuditLogs(GetAuditLogsRequest) returns (GetAuditLogsResponse)`
- `GetUserPrivacyMode(GetUserPrivacyModeRequest) returns (GetUserPrivacyModeResponse)`
- `SetUserPrivacyMode(SetUserPrivacyModeRequest) returns (SetUserPrivacyModeResponse)`
- `WebAcknowledgeGracePeriodDisclaimer(WebAcknowledgeGracePeriodDisclaimerRequest) returns (WebAcknowledgeGracePeriodDisclaimerResponse)`
- `SkipPrivacyModeGracePeriod(SkipPrivacyModeGracePeriodRequest) returns (SkipPrivacyModeGracePeriodResponse)`
- `NeedsPrivacyModeMigration(NeedsPrivacyModeMigrationRequest) returns (NeedsPrivacyModeMigrationResponse)`
- `UpdateTeamPrivacyModeMigrationOptOut(UpdateTeamPrivacyModeMigrationOptOutRequest) returns (UpdateTeamPrivacyModeMigrationOptOutResponse)`
- `ShareConversation(ShareConversationRequest) returns (ShareConversationResponse)`
- `GetSharedConversation(GetSharedConversationRequest) returns (GetSharedConversationResponse)`
- `GetPublicSharedConversation(GetPublicSharedConversationRequest) returns (GetPublicSharedConversationResponse)`
- `ListSharedConversations(ListSharedConversationsRequest) returns (ListSharedConversationsResponse)`
- `DeleteSharedConversation(DeleteSharedConversationRequest) returns (DeleteSharedConversationResponse)`
- `UpdateSharedConversationVisibility(UpdateSharedConversationVisibilityRequest) returns (UpdateSharedConversationVisibilityResponse)`
- `ShareCanvas(ShareCanvasRequest) returns (ShareCanvasResponse)`
- `GetSharedCanvas(GetSharedCanvasRequest) returns (GetSharedCanvasResponse)`
- `GetPublicSharedCanvas(GetPublicSharedCanvasRequest) returns (GetPublicSharedCanvasResponse)`
- `ListSharedCanvases(ListSharedCanvasesRequest) returns (ListSharedCanvasesResponse)`
- `DeleteSharedCanvas(DeleteSharedCanvasRequest) returns (DeleteSharedCanvasResponse)`
- `LookupSharedCanvasByKey(LookupSharedCanvasByKeyRequest) returns (LookupSharedCanvasByKeyResponse)`
- `GetTeamSharedConversationSettings(GetTeamSharedConversationSettingsRequest) returns (GetTeamSharedConversationSettingsResponse)`
- `UpdateTeamSharedConversationSettings(UpdateTeamSharedConversationSettingsRequest) returns (UpdateTeamSharedConversationSettingsResponse)`
- `GetTeamSharedCanvasSettings(GetTeamSharedCanvasSettingsRequest) returns (GetTeamSharedCanvasSettingsResponse)`
- `UpdateTeamSharedCanvasSettings(UpdateTeamSharedCanvasSettingsRequest) returns (UpdateTeamSharedCanvasSettingsResponse)`
- `GetTeamBackgroundAgentSettings(GetTeamBackgroundAgentSettingsRequest) returns (GetTeamBackgroundAgentSettingsResponse)`
- `UpdateTeamBackgroundAgentSettings(UpdateTeamBackgroundAgentSettingsRequest) returns (UpdateTeamBackgroundAgentSettingsResponse)`
- `RevokeTeamInviteLink(RevokeTeamInviteLinkRequest) returns (RevokeTeamInviteLinkResponse)`
- `ListTeamInviteLinks(ListTeamInviteLinksRequest) returns (ListTeamInviteLinksResponse)`
- `UpdateUserName(UpdateUserNameRequest) returns (UpdateUserNameResponse)`
- `UploadUserProfilePicture(UploadUserProfilePictureRequest) returns (UploadUserProfilePictureResponse)`
- `UpdateUserProfilePicture(UpdateUserProfilePictureRequest) returns (UpdateUserProfilePictureResponse)`
- `ListInvoices(ListInvoicesRequest) returns (ListInvoicesResponse)`
- `GetRemainingRefunds(GetRemainingRefundsRequest) returns (GetRemainingRefundsResponse)`
- `GetServiceAccountSpendLimit(GetServiceAccountSpendLimitRequest) returns (GetServiceAccountSpendLimitResponse)`
- `SetServiceAccountSpendLimit(SetServiceAccountSpendLimitRequest) returns (SetServiceAccountSpendLimitResponse)`
- `SetUserHardLimit(SetUserHardLimitRequest) returns (SetUserHardLimitResponse)`
- `SetUserMonthlyLimit(SetUserMonthlyLimitRequest) returns (SetUserMonthlyLimitResponse)`
- `ToggleMarketingEmailOpt(ToggleMarketingEmailOptRequest) returns (ToggleMarketingEmailOptResponse)`
- `GetMarketingEmailOpt(GetMarketingEmailOptRequest) returns (GetMarketingEmailOptResponse)`
- `GetGlobalLeaderboardOptIn(GetGlobalLeaderboardOptInRequest) returns (GetGlobalLeaderboardOptInResponse)`
- `SetGlobalLeaderboardOptIn(SetGlobalLeaderboardOptInRequest) returns (SetGlobalLeaderboardOptInResponse)`
- `CreateTeamApiKey(CreateTeamApiKeyRequest) returns (CreateTeamApiKeyResponse)`
- `RevokeTeamApiKey(RevokeTeamApiKeyRequest) returns (RevokeTeamApiKeyResponse)`
- `ListTeamApiKeys(ListTeamApiKeysRequest) returns (ListTeamApiKeysResponse)`
- `CreateOrganizationApiKey(CreateOrganizationApiKeyRequest) returns (CreateOrganizationApiKeyResponse)`
- `RevokeOrganizationApiKey(RevokeOrganizationApiKeyRequest) returns (RevokeOrganizationApiKeyResponse)`
- `ListOrganizationApiKeys(ListOrganizationApiKeysRequest) returns (ListOrganizationApiKeysResponse)`
- `CreateAutomationWebhookApiKey(CreateAutomationWebhookApiKeyRequest) returns (CreateAutomationWebhookApiKeyResponse)`
- `CreateTeamServiceAccount(CreateTeamServiceAccountRequest) returns (CreateTeamServiceAccountResponse)`
- `ListTeamServiceAccounts(ListTeamServiceAccountsRequest) returns (ListTeamServiceAccountsResponse)`
- `DeleteTeamServiceAccount(DeleteTeamServiceAccountRequest) returns (DeleteTeamServiceAccountResponse)`
- `ArchiveTeamServiceAccount(ArchiveTeamServiceAccountRequest) returns (ArchiveTeamServiceAccountResponse)`
- `RotateServiceAccountApiKey(RotateServiceAccountApiKeyRequest) returns (RotateServiceAccountApiKeyResponse)`
- `GetTeamRepositoriesForServiceAccountScope(GetTeamRepositoriesForServiceAccountScopeRequest) returns (GetTeamRepositoriesForServiceAccountScopeResponse)`
- `UpdateServiceAccountRepoScope(UpdateServiceAccountRepoScopeRequest) returns (UpdateServiceAccountRepoScopeResponse)`
- `CreateUserApiKey(CreateUserApiKeyRequest) returns (CreateUserApiKeyResponse)`
- `RevokeUserApiKey(RevokeUserApiKeyRequest) returns (RevokeUserApiKeyResponse)`
- `ListUserApiKeys(ListUserApiKeysRequest) returns (ListUserApiKeysResponse)`
- `ConfirmGithubInstallation(ConfirmGithubInstallationRequest) returns (ConfirmGithubInstallationResponse)`
- `UpdateTeamName(UpdateTeamNameRequest) returns (UpdateTeamNameResponse)`
- `UpdateTeamDashboardAnalyticsSetting(UpdateTeamDashboardAnalyticsSettingRequest) returns (UpdateTeamDashboardAnalyticsSettingResponse)`
- `UpdateTeamScimRequireUserDirectorySetting(UpdateTeamScimRequireUserDirectorySettingRequest) returns (UpdateTeamScimRequireUserDirectorySettingResponse)`
- `GetTeamScimRequireUserDirectoryPreview(GetTeamScimRequireUserDirectoryPreviewRequest) returns (GetTeamScimRequireUserDirectoryPreviewResponse)`
- `GetSlackUserSettings(GetSlackUserSettingsRequest) returns (GetSlackUserSettingsResponse)`
- `UpdateSlackUserSettings(UpdateSlackUserSettingsRequest) returns (UpdateSlackUserSettingsResponse)`
- `GetSlackRepoRoutingRules(GetSlackRepoRoutingRulesRequest) returns (GetSlackRepoRoutingRulesResponse)`
- `CreateSlackRepoRoutingRule(CreateSlackRepoRoutingRuleRequest) returns (CreateSlackRepoRoutingRuleResponse)`
- `UpdateSlackRepoRoutingRule(UpdateSlackRepoRoutingRuleRequest) returns (UpdateSlackRepoRoutingRuleResponse)`
- `DeleteSlackRepoRoutingRule(DeleteSlackRepoRoutingRuleRequest) returns (DeleteSlackRepoRoutingRuleResponse)`
- `IsOnNewPricing(IsOnNewPricingRequest) returns (IsOnNewPricingResponse)`
- `GetLinearAuthUrl(GetLinearAuthUrlRequest) returns (GetLinearAuthUrlResponse)`
- `ConnectLinearCallback(ConnectLinearCallbackRequest) returns (ConnectLinearCallbackResponse)`
- `GetMicrosoftTeamsLinkContext(GetMicrosoftTeamsLinkContextRequest) returns (GetMicrosoftTeamsLinkContextResponse)`
- `SetMicrosoftTeamsAuth(SetMicrosoftTeamsAuthRequest) returns (SetMicrosoftTeamsAuthResponse)`
- `GetLinearStatus(GetLinearStatusRequest) returns (GetLinearStatusResponse)`
- `DisconnectLinear(DisconnectLinearRequest) returns (DisconnectLinearResponse)`
- `GetLinearTeams(GetLinearTeamsRequest) returns (GetLinearTeamsResponse)`
- `GetLinearSettings(GetLinearSettingsRequest) returns (GetLinearSettingsResponse)`
- `UpdateLinearTeamSetting(UpdateLinearTeamSettingRequest) returns (UpdateLinearTeamSettingResponse)`
- `UpdateLinearProjectSetting(UpdateLinearProjectSettingRequest) returns (UpdateLinearProjectSettingResponse)`
- `GetLinearLabels(GetLinearLabelsRequest) returns (GetLinearLabelsResponse)`
- `GetLinearIssues(GetLinearIssuesRequest) returns (GetLinearIssuesResponse)`
- `GetPagerDutyAuthUrl(GetPagerDutyAuthUrlRequest) returns (GetPagerDutyAuthUrlResponse)`
- `ConnectPagerDutyCallback(ConnectPagerDutyCallbackRequest) returns (ConnectPagerDutyCallbackResponse)`
- `GetPagerDutyStatus(GetPagerDutyStatusRequest) returns (GetPagerDutyStatusResponse)`
- `GetPagerDutyServices(GetPagerDutyServicesRequest) returns (GetPagerDutyServicesResponse)`
- `DisconnectPagerDuty(DisconnectPagerDutyRequest) returns (DisconnectPagerDutyResponse)`
- `GetJiraInstallUrl(GetJiraInstallUrlRequest) returns (GetJiraInstallUrlResponse)`
- `LinkJiraInstallation(LinkJiraInstallationRequest) returns (LinkJiraInstallationResponse)`
- `GetJiraStatus(GetJiraStatusRequest) returns (GetJiraStatusResponse)`
- `DisconnectJira(DisconnectJiraRequest) returns (DisconnectJiraResponse)`
- `GetJiraProjects(GetJiraProjectsRequest) returns (GetJiraProjectsResponse)`
- `GetJiraTeamSettings(GetJiraTeamSettingsRequest) returns (GetJiraTeamSettingsResponse)`
- `UpdateJiraTeamSettings(UpdateJiraTeamSettingsRequest) returns (UpdateJiraTeamSettingsResponse)`
- `GetJiraRoutingRules(GetJiraRoutingRulesRequest) returns (GetJiraRoutingRulesResponse)`
- `CreateJiraRoutingRule(CreateJiraRoutingRuleRequest) returns (CreateJiraRoutingRuleResponse)`
- `UpdateJiraRoutingRule(UpdateJiraRoutingRuleRequest) returns (UpdateJiraRoutingRuleResponse)`
- `DeleteJiraRoutingRule(DeleteJiraRoutingRuleRequest) returns (DeleteJiraRoutingRuleResponse)`
- `LinkJiraUser(LinkJiraUserRequest) returns (LinkJiraUserResponse)`
- `ListJiraUserLinks(ListJiraUserLinksRequest) returns (ListJiraUserLinksResponse)`
- `UnlinkJiraUser(UnlinkJiraUserRequest) returns (UnlinkJiraUserResponse)`
- `DeleteBedrockIamRole(DeleteBedrockIamRoleRequest) returns (DeleteBedrockIamRoleResponse)`
- `UnlinkSlackAccess(UnlinkSlackAccessRequest) returns (UnlinkSlackAccessResponse)`
- `ListSlackConversations(ListSlackConversationsRequest) returns (ListSlackConversationsResponse)`
- `ListMicrosoftTeamsChannels(ListMicrosoftTeamsChannelsRequest) returns (ListMicrosoftTeamsChannelsResponse)`
- `GetSlackConversationsByIds(GetSlackConversationsByIdsRequest) returns (GetSlackConversationsByIdsResponse)`
- `LogSlackbotAuthConversionFunnel(LogSlackbotAuthConversionFunnelRequest) returns (LogSlackbotAuthConversionFunnelResponse)`
- `LogClickedConnectSlack(LogClickedConnectSlackRequest) returns (LogClickedConnectSlackResponse)`
- `CheckUserApiKeyAccess(CheckUserApiKeyAccessRequest) returns (CheckUserApiKeyAccessResponse)`
- `IsAllowedFreeTrialUsage(IsAllowedFreeTrialUsageRequest) returns (IsAllowedFreeTrialUsageResponse)`
- `IsNextSetupRunFree(IsNextSetupRunFreeRequest) returns (IsNextSetupRunFreeResponse)`
- `CompletedLinkSlackAccount(CompletedLinkSlackAccountRequest) returns (CompletedLinkSlackAccountResponse)`
- `NotifyTeamAdmins(NotifyTeamAdminsRequest) returns (NotifyTeamAdminsResponse)`
- `GetAdminNotificationStatus(GetAdminNotificationStatusRequest) returns (GetAdminNotificationStatusResponse)`
- `OptOutNewPricing(OptOutNewPricingRequest) returns (OptOutNewPricingResponse)`
- `SubmitFeedback(SubmitFeedbackRequest) returns (SubmitFeedbackResponse)`
- `CanStudentReverify(CanStudentReverifyRequest) returns (CanStudentReverifyResponse)`
- `GetActiveOffboardingBanner(GetActiveOffboardingBannerRequest) returns (GetActiveOffboardingBannerResponse)`
- `ClientAction(ClientActionRequest) returns (ClientActionResponse)`
- `ListUsageAlerts(ListUsageAlertsRequest) returns (ListUsageAlertsResponse)`
- `CreateUsageAlerts(CreateUsageAlertsRequest) returns (CreateUsageAlertsResponse)`
- `DeleteUsageAlerts(DeleteUsageAlertsRequest) returns (DeleteUsageAlertsResponse)`
- `UpdateUsageAlerts(UpdateUsageAlertsRequest) returns (UpdateUsageAlertsResponse)`
- `RequestIndividualLimitsOptOut(RequestIndividualLimitsOptOutRequest) returns (RequestIndividualLimitsOptOutResponse)`
- `ListMarketplacePlugins(ListMarketplacePluginsRequest) returns (ListMarketplacePluginsResponse)`
- `GetUserProfile(GetUserProfileRequest) returns (GetUserProfileResponse)`
- `UpdateUserProfile(UpdateUserProfileRequest) returns (UpdateUserProfileResponse)`
- `ClaimUserProfileHandle(ClaimUserProfileHandleRequest) returns (ClaimUserProfileHandleResponse)`
- `GetPublicProfileByHandle(GetPublicProfileByHandleRequest) returns (GetPublicProfileByHandleResponse)`
- `GetPlugin(GetPluginRequest) returns (GetPluginResponse)`
- `CreatePlugin(CreatePluginRequest) returns (CreatePluginResponse)`
- `UpdatePlugin(UpdatePluginRequest) returns (UpdatePluginResponse)`
- `ParseGitHubRepoForPlugins(ParseGitHubRepoForPluginRequest) returns (ParseGitHubRepoForPluginsResponse)`
- `ImportPluginsFromGitHub(ImportPluginsFromGitHubRequest) returns (ImportPluginsFromGitHubResponse)`
- `PreviewReindexPluginRepoInternal(PreviewReindexPluginRepoInternalRequest) returns (PreviewReindexPluginRepoResponse)`
- `ApplyReindexPluginRepoInternal(ApplyReindexPluginRepoInternalRequest) returns (ApplyReindexPluginRepoResponse)`
- `PreviewMigrateReindexPluginRepoInternal(PreviewMigrateReindexPluginRepoInternalRequest) returns (PreviewMigrateReindexPluginRepoResponse)`
- `ApplyMigrateReindexPluginRepoInternal(ApplyMigrateReindexPluginRepoInternalRequest) returns (ApplyMigrateReindexPluginRepoResponse)`
- `SubmitPluginForApproval(SubmitPluginForApprovalRequest) returns (SubmitPluginForApprovalResponse)`
- `ApprovePlugin(ApprovePluginRequest) returns (ApprovePluginResponse)`
- `RejectPlugin(RejectPluginRequest) returns (RejectPluginResponse)`
- `ListUserPluginInstalls(ListUserPluginInstallsRequest) returns (ListUserPluginInstallsResponse)`
- `InstallUserPlugin(InstallUserPluginRequest) returns (InstallUserPluginResponse)`
- `UpdateUserPluginInstall(UpdateUserPluginInstallRequest) returns (UpdateUserPluginInstallResponse)`
- `UninstallUserPlugin(UninstallUserPluginRequest) returns (UninstallUserPluginResponse)`
- `ListTeamPluginInstalls(ListTeamPluginInstallsRequest) returns (ListTeamPluginInstallsResponse)`
- `GetTeamPluginPopularity(GetTeamPluginPopularityRequest) returns (GetTeamPluginPopularityResponse)`
- `GetTeamPluginPrimitiveUsage(GetTeamPluginPrimitiveUsageRequest) returns (GetTeamPluginPrimitiveUsageResponse)`
- `ListTeamAvailableMarketplacePlugins(ListTeamAvailableMarketplacePluginsRequest) returns (ListTeamAvailableMarketplacePluginsResponse)`
- `GetTeamPinnedMarketplacePlugins(GetTeamPinnedMarketplacePluginsRequest) returns (GetTeamPinnedMarketplacePluginsResponse)`
- `UpdateTeamPinnedMarketplacePlugins(UpdateTeamPinnedMarketplacePluginsRequest) returns (UpdateTeamPinnedMarketplacePluginsResponse)`
- `InstallTeamPlugin(InstallTeamPluginRequest) returns (InstallTeamPluginResponse)`
- `UpdateTeamPluginInstall(UpdateTeamPluginInstallRequest) returns (UpdateTeamPluginInstallResponse)`
- `UninstallTeamPlugin(UninstallTeamPluginRequest) returns (UninstallTeamPluginResponse)`
- `GetEffectiveUserPlugins(GetEffectiveUserPluginsRequest) returns (GetEffectiveUserPluginsResponse)`
- `ResolvePluginsByRef(ResolvePluginsByRefRequest) returns (ResolvePluginsByRefResponse)`
- `DeprecatePlugin(DeprecatePluginRequest) returns (DeprecatePluginResponse)`
- `ListMarketplaces(ListMarketplacesRequest) returns (ListMarketplacesResponse)`
- `AddMarketplace(AddMarketplaceRequest) returns (AddMarketplaceResponse)`
- `GetOrCreateDefaultTeamMarketplace(GetOrCreateDefaultTeamMarketplaceRequest) returns (GetOrCreateDefaultTeamMarketplaceResponse)`
- `UpdateMarketplace(UpdateMarketplaceRequest) returns (UpdateMarketplaceResponse)`
- `RemoveMarketplace(RemoveMarketplaceRequest) returns (RemoveMarketplaceResponse)`
- `RefreshMarketplace(RefreshMarketplaceRequest) returns (RefreshMarketplaceResponse)`
- `ReindexAndApplyTeamMarketplaceChanges(ReindexAndApplyTeamMarketplaceChangesRequest) returns (ReindexAndApplyTeamMarketplaceChangesResponse)`
- `RegisterMarketplaceAndPlugins(RegisterMarketplaceAndPluginsRequest) returns (RegisterMarketplaceAndPluginsResponse)`
- `UpdateTeamMarketplaceConfig(UpdateTeamMarketplaceConfigRequest) returns (UpdateTeamMarketplaceConfigResponse)`
- `SetTeamMarketplaceRepository(SetTeamMarketplaceRepositoryRequest) returns (SetTeamMarketplaceRepositoryResponse)`
- `SetTeamMarketplacePluginPolicies(SetTeamMarketplacePluginPoliciesRequest) returns (SetTeamMarketplacePluginPoliciesResponse)`
- `SetTeamMarketplacePluginPolicyVariables(SetTeamMarketplacePluginPolicyVariablesRequest) returns (SetTeamMarketplacePluginPolicyVariablesResponse)`
- `ApplyTeamMarketplaceRequiredPlugins(ApplyTeamMarketplaceRequiredPluginsRequest) returns (ApplyTeamMarketplaceRequiredPluginsResponse)`
- `LinkPluginsToTeamMarketplace(LinkPluginsToTeamMarketplaceRequest) returns (LinkPluginsToTeamMarketplaceResponse)`
- `UnlinkPluginsFromTeamMarketplace(UnlinkPluginsFromTeamMarketplaceRequest) returns (UnlinkPluginsFromTeamMarketplaceResponse)`
- `GetManagedSkills(GetManagedSkillsRequest) returns (GetManagedSkillsResponse)`
- `GetCursorUserState(GetCursorUserStateRequest) returns (GetCursorUserStateResponse)`
- `SetJobData(SetJobDataRequest) returns (SetJobDataResponse)`

### `aiserver.v1.DebuggerService`

- `GitFilter(GitFilterRequest) returns (stream GitFilterResponse)`
- `FileFilter(FileFilterRequest) returns (stream FileFilterResponse)`
- `BugAnalysis(BugAnalysisRequest) returns (stream BugAnalysisResponse)`

### `aiserver.v1.DeeplinkService`

- `CreateDeeplink(CreateDeeplinkRequest) returns (CreateDeeplinkResponse)`
- `GetDeeplinkData(GetDeeplinkDataRequest) returns (GetDeeplinkDataResponse)`
- `ListDeeplinks(ListDeeplinksRequest) returns (ListDeeplinksResponse)`

### `aiserver.v1.DistributorService`

- `SchedulerStream(SchedulerStreamRequest) returns (SchedulerStreamResponse)`

### `aiserver.v1.EnterpriseAdminService`

- `GetManualEnterpriseContract(GetManualEnterpriseContractRequest) returns (GetManualEnterpriseContractResponse)`
- `ListManualEnterpriseContracts(ListManualEnterpriseContractsRequest) returns (ListManualEnterpriseContractsResponse)`
- `ListManualEnterpriseContractArchive(ListManualEnterpriseContractArchiveRequest) returns (ListManualEnterpriseContractArchiveResponse)`
- `CreateManualEnterpriseContract(CreateManualEnterpriseContractRequest) returns (CreateManualEnterpriseContractResponse)`
- `CreateContractExpansion(CreateContractExpansionRequest) returns (CreateContractExpansionResponse)`
- `UpsertManualEnterpriseContract(UpsertManualEnterpriseContractRequest) returns (UpsertManualEnterpriseContractResponse)`
- `DeleteManualEnterpriseContract(DeleteManualEnterpriseContractRequest) returns (DeleteManualEnterpriseContractResponse)`
- `ListEnterpriseContracts(ListEnterpriseContractsRequest) returns (ListEnterpriseContractsResponse)`
- `EnableTokenBasedPricing(EnableTokenBasedPricingRequest) returns (EnableTokenBasedPricingResponse)`
- `GetEnterpriseStatus(GetEnterpriseStatusRequest) returns (GetEnterpriseStatusResponse)`
- `StartTokenBasedTrial(StartTokenBasedTrialRequest) returns (StartTokenBasedTrialResponse)`
- `GetTeamUsageForDateRange(GetTeamUsageForDateRangeRequest) returns (GetTeamUsageForDateRangeResponse)`

### `aiserver.v1.EvalTrackingService`

- `CreateEval(CreateEvalRequest) returns (CreateEvalResponse)`
- `GetEvalByName(GetEvalByNameRequest) returns (GetEvalByNameResponse)`
- `GetRun(GetRunRequest) returns (GetRunResponse)`
- `CreateRun(CreateRunRequest) returns (CreateRunResponse)`
- `UpdateRunStatus(UpdateRunStatusRequest) returns (UpdateRunStatusResponse)`
- `SetRunSummary(SetRunSummaryRequest) returns (SetRunSummaryResponse)`
- `LogRunMetrics(LogRunMetricsRequest) returns (LogRunMetricsResponse)`
- `SetRunParams(SetRunParamsRequest) returns (SetRunParamsResponse)`
- `SetRunTags(SetRunTagsRequest) returns (SetRunTagsResponse)`
- `UpsertRunRolloutStatus(UpsertRunRolloutStatusRequest) returns (UpsertRunRolloutStatusResponse)`
- `Heartbeat(HeartbeatRequest) returns (HeartbeatResponse)`
- `RequestKill(RequestKillRequest) returns (RequestKillResponse)`
- `SetRayJobName(SetRayJobNameRequest) returns (SetRayJobNameResponse)`
- `GetRunKillStatus(GetRunKillStatusRequest) returns (GetRunKillStatusResponse)`
- `CreateEvalCronJob(CreateEvalCronJobRequest) returns (CreateEvalCronJobResponse)`
- `GetEvalCronJobByName(GetEvalCronJobByNameRequest) returns (GetEvalCronJobByNameResponse)`
- `ListEvalCronJobs(ListEvalCronJobsRequest) returns (ListEvalCronJobsResponse)`
- `DeleteEvalCronJobByName(DeleteEvalCronJobByNameRequest) returns (DeleteEvalCronJobByNameResponse)`
- `CreateRlEvalJob(CreateRlEvalJobRequest) returns (CreateRlEvalJobResponse)`
- `GetRlEvalJob(GetRlEvalJobRequest) returns (GetRlEvalJobResponse)`
- `ListRlEvalJobs(ListRlEvalJobsRequest) returns (ListRlEvalJobsResponse)`
- `UpdateRlEvalJob(UpdateRlEvalJobRequest) returns (UpdateRlEvalJobResponse)`
- `UpsertRlEvalJobStep(UpsertRlEvalJobStepRequest) returns (UpsertRlEvalJobStepResponse)`
- `SetEvalRunRlEvalJobStep(SetEvalRunRlEvalJobStepRequest) returns (SetEvalRunRlEvalJobStepResponse)`
- `UpdateRlEvalStepDatasetEval(UpdateRlEvalStepDatasetEvalRequest) returns (UpdateRlEvalStepDatasetEvalResponse)`
- `UpdateDataOpsJob(UpdateDataOpsJobRequest) returns (UpdateDataOpsJobResponse)`
- `GetDataOpsJob(GetDataOpsJobRequest) returns (GetDataOpsJobResponse)`
- `ListDataOpsJobs(ListDataOpsJobsRequest) returns (ListDataOpsJobsResponse)`
- `UpsertDataOpsJobStep(UpsertDataOpsJobStepRequest) returns (UpsertDataOpsJobStepResponse)`

### `aiserver.v1.FastApplyService`

- `ReportEditFate(ReportEditFateRequest) returns (ReportEditFateResponse)`
- `WarmApply(WarmApplyRequest) returns (WarmApplyResponse)`

### `aiserver.v1.FileSyncService`

- `FSUploadFile(FSUploadFileRequest) returns (FSUploadFileResponse)`
- `FSSyncFile(FSSyncFileRequest) returns (FSSyncFileResponse)`
- `FSIsEnabledForUser(FSIsEnabledForUserRequest) returns (FSIsEnabledForUserResponse)`
- `FSConfig(FSConfigRequest) returns (FSConfigResponse)`
- `FSGetFileContents(FSGetFileContentsRequest) returns (FSGetFileContentsResponse)`
- `FSGetMultiFileContents(FSGetMultiFileContentsRequest) returns (FSGetMultiFileContentsResponse)`
- `FSInternalSyncFile(FSSyncFileRequest) returns (FSSyncFileResponse)`
- `FSInternalUploadFile(FSUploadFileRequest) returns (FSUploadFileResponse)`
- `FSInternalHealthCheck(FSInternalHealthCheckRequest) returns (FSInternalHealthCheckResponse)`

### `aiserver.v1.FullSelfDrivingService`

- `SetFullSelfDrivingConfig(SetFullSelfDrivingConfigRequest) returns (SetFullSelfDrivingConfigResponse)`
- `GetFullSelfDrivingConfig(GetFullSelfDrivingConfigRequest) returns (GetFullSelfDrivingConfigResponse)`
- `ListFullSelfDrivingRuns(ListFullSelfDrivingRunsRequest) returns (ListFullSelfDrivingRunsResponse)`
- `GetFullSelfDrivingRunSuggestion(GetFullSelfDrivingRunSuggestionRequest) returns (GetFullSelfDrivingRunSuggestionResponse)`
- `ApplyFullSelfDrivingSuggestion(ApplyFullSelfDrivingSuggestionRequest) returns (ApplyFullSelfDrivingSuggestionResponse)`
- `ListFullSelfDrivingFindings(ListFullSelfDrivingFindingsRequest) returns (ListFullSelfDrivingFindingsResponse)`
- `RecordFullSelfDrivingOutputs(RecordFullSelfDrivingOutputsRequest) returns (RecordFullSelfDrivingOutputsResponse)`
- `UpdateFullSelfDrivingOutput(UpdateFullSelfDrivingOutputRequest) returns (UpdateFullSelfDrivingOutputResponse)`
- `SupersedeFullSelfDrivingOutput(SupersedeFullSelfDrivingOutputRequest) returns (SupersedeFullSelfDrivingOutputResponse)`
- `DismissFullSelfDrivingOutput(DismissFullSelfDrivingOutputRequest) returns (DismissFullSelfDrivingOutputResponse)`
- `UndoFullSelfDrivingOutput(UndoFullSelfDrivingOutputRequest) returns (UndoFullSelfDrivingOutputResponse)`
- `UpdateFullSelfDrivingFindingStatus(UpdateFullSelfDrivingFindingStatusRequest) returns (UpdateFullSelfDrivingFindingStatusResponse)`
- `RunFullSelfDrivingWorkflowSuggestion(RunFullSelfDrivingWorkflowSuggestionRequest) returns (RunFullSelfDrivingWorkflowSuggestionResponse)`
- `BuildFullSelfDrivingTriageContext(BuildFullSelfDrivingTriageContextRequest) returns (BuildFullSelfDrivingTriageContextResponse)`
- `PrepareLocalFullSelfDrivingRun(PrepareLocalFullSelfDrivingRunRequest) returns (PrepareLocalFullSelfDrivingRunResponse)`
- `RunFullSelfDrivingCloudCommand(RunFullSelfDrivingCloudCommandRequest) returns (RunFullSelfDrivingCloudCommandResponse)`

### `aiserver.v1.GitGraphService`

- `InitGitGraph(InitGitGraphRequest) returns (InitGitGraphResponse)`
- `InitGitGraphChallenge(InitGitGraphChallengeRequest) returns (InitGitGraphChallengeResponse)`
- `BatchedUploadCommitsIntoGitGraph(BatchedUploadCommitsIntoGitGraphRequest) returns (BatchedUploadCommitsIntoGitGraphResponse)`
- `GetPendingCommits(GetPendingCommitsRequest) returns (GetPendingCommitsResponse)`
- `MarkPendingCommits(MarkPendingCommitsRequest) returns (MarkPendingCommitsResponse)`
- `GetGitGraphRelatedFiles(GetGitGraphRelatedFilesRequest) returns (GetGitGraphRelatedFilesResponse)`
- `GetGitGraphStatus(GetGitGraphStatusRequest) returns (GetGitGraphStatusResponse)`
- `DeleteGitGraph(DeleteGitGraphRequest) returns (DeleteGitGraphResponse)`
- `IsGitGraphEnabled(IsGitGraphEnabledRequest) returns (IsGitGraphEnabledResponse)`

### `aiserver.v1.GitIndexService`

- `RepoHistoryInitHandshake(RepoHistoryInitHandshakeRequest) returns (RepoHistoryInitHandshakeResponse)`
- `RepoHistorySyncOne(RepoHistorySyncOneRequest) returns (RepoHistorySyncOneResponse)`
- `RepoHistorySyncComplete(RepoHistorySyncCompleteRequest) returns (RepoHistorySyncCompleteResponse)`
- `RemoveRepoHistory(RemoveRepoHistoryRequest) returns (RemoveRepoHistoryResponse)`
- `SearchPRHistory(SearchPRHistoryRequest) returns (SearchPRHistoryResponse)`
- `GetPRIndexingStatus(GetPRIndexingStatusRequest) returns (GetPRIndexingStatusResponse)`

### `aiserver.v1.HallucinatedFunctionsService`

- `V0ChainRun(V0ChainRunRequest) returns (stream V0ChainRunResponse)`
- `Opus2ChainPlan(Opus2ChainPlanRequest) returns (stream Opus2ChainPlanResponse)`
- `Opus2ChainApplyPlan(Opus2ChainApplyPlanRequest) returns (stream Opus2ChainApplyPlanResponse)`
- `Opus2ChainReflect(Opus2ChainReflectRequest) returns (stream Opus2ChainReflectResponse)`
- `SortUsefulTypesNaive(SortUsefulTypesNaiveRequest) returns (SortUsefulTypesNaiveResponse)`

### `aiserver.v1.HealthService`

- `Ping(HealthRequest) returns (HealthResponse)`
- `Unary(HealthEmptyRequest) returns (HealthResponse)`
- `Stream(HealthRequest) returns (stream HealthResponse)`
- `StreamSSE(HealthRequest) returns (stream HealthResponse)`
- `StreamBidi(HealthRequest) returns (HealthResponse)`
- `StreamBidiSSE(BidiRequestId) returns (stream HealthResponse)`
- `StreamBidiPoll(BidiPollRequest) returns (stream BidiPollResponse)`

### `aiserver.v1.InAppAdService`

- `HasSeenAd(HasSeenAdRequest) returns (HasSeenAdResponse)`
- `MarkAdAsSeen(MarkAdAsSeenRequest) returns (MarkAdAsSeenResponse)`
- `ResetUserAdViews(ResetUserAdViewsRequest) returns (ResetUserAdViewsResponse)`
- `GetAllAdPreviews(GetAllAdPreviewsRequest) returns (GetAllAdPreviewsResponse)`

### `aiserver.v1.InferenceService`

- `Stream(InferenceStreamRequest) returns (stream InferenceStreamResponse)`
- `RecordAgentFollowupClassification(AgentFollowupCategorizationRequest) returns (GoogleProtobuf_Empty)`

### `aiserver.v1.LinterService`

- `LintFile(LintFileRequest) returns (LintFileResponse)`
- `LintChunk(LintChunkRequest) returns (LintChunkResponse)`
- `LintFimChunk(LintFimChunkRequest) returns (LintFimChunkResponse)`
- `LintExplanation(LintExplanationRequest) returns (stream LintExplanationResponse)`
- `LintExplanation2(LintExplanationRequest) returns (LintExplanationResponse2)`

### `aiserver.v1.MCPRegistryService`

- `GetKnownServers(GetKnownServersRequest) returns (GetKnownServersResponse)`

### `aiserver.v1.MarketplaceService`

- `CreateMarketplaceExtensionPublisher(CreateMarketplaceExtensionPublisherRequest) returns (CreateMarketplaceExtensionPublisherResponse)`

### `aiserver.v1.MetricsService`

- `ReportIncrement(ReportMetricsRequest) returns (ReportMetricsResponse)`
- `ReportDecrement(ReportMetricsRequest) returns (ReportMetricsResponse)`
- `ReportDistribution(ReportMetricsRequest) returns (ReportMetricsResponse)`
- `ReportGauge(ReportMetricsRequest) returns (ReportMetricsResponse)`

### `aiserver.v1.NetworkService`

- `GetPublicIp(GetPublicIpRequest) returns (GetPublicIpResponse)`
- `IsConnected(IsConnectedRequest) returns (IsConnectedResponse)`

### `aiserver.v1.OnlineMetricsService`

- `ReportAgentSnapshot(ReportAgentSnapshotRequest) returns (ReportAgentSnapshotResponse)`

### `aiserver.v1.PerformanceEventService`

- `SubmitPerformanceEvents(SubmitPerformanceEventsRequest) returns (SubmitPerformanceEventsResponse)`

### `aiserver.v1.ProfilingService`

- `SubmitProfile(SubmitProfileRequest) returns (SubmitProfileResponse)`

### `aiserver.v1.ReplayChatService`

- `StreamReplayChat(StreamReplayChatRequest) returns (stream StreamUnifiedChatResponseWithTools)`

### `aiserver.v1.RepositoryService`

- `FastRepoInitHandshake(FastRepoInitHandshakeRequest) returns (FastRepoInitHandshakeResponse)`
- `SyncMerkleSubtree(SyncMerkleSubtreeRequest) returns (SyncMerkleSubtreeResponse)`
- `FastUpdateFile(FastUpdateFileRequest) returns (FastUpdateFileResponse)`
- `SearchRepositoryV2(SearchRepositoryRequest) returns (SearchRepositoryResponse)`
- `RemoveRepositoryV2(RemoveRepositoryRequest) returns (RemoveRepositoryResponse)`
- `FastRepoInitHandshakeV2(FastRepoInitHandshakeV2Request) returns (FastRepoInitHandshakeV2Response)`
- `SyncMerkleSubtreeV2(SyncMerkleSubtreeV2Request) returns (SyncMerkleSubtreeV2Response)`
- `FastUpdateFileV2(FastUpdateFileV2Request) returns (FastUpdateFileV2Response)`
- `FastRepoSyncComplete(FastRepoSyncCompleteRequest) returns (FastRepoSyncCompleteResponse)`
- `SemSearchFast(SemSearchRequest) returns (stream SemSearchResponse)`
- `SemSearch(SemSearchRequest) returns (stream SemSearchResponse)`
- `EnsureIndexCreated(EnsureIndexCreatedRequest) returns (EnsureIndexCreatedResponse)`
- `GetHighLevelFolderDescription(GetHighLevelFolderDescriptionRequest) returns (GetHighLevelFolderDescriptionResponse)`
- `GetEmbeddings(GetEmbeddingsRequest) returns (GetEmbeddingsResponse)`
- `GetUploadLimits(GetUploadLimitsRequest) returns (GetUploadLimitsResponse)`
- `GetNumFilesToSend(GetNumFilesToSendRequest) returns (GetNumFilesToSendResponse)`
- `GetAvailableChunkingStrategies(GetAvailableChunkingStrategiesRequest) returns (GetAvailableChunkingStrategiesResponse)`
- `GetLineNumberClassifications(GetLineNumberClassificationsRequest) returns (stream GetLineNumberClassificationsResponse)`
- `GetCopyStatus(GetCopyStatusRequest) returns (GetCopyStatusResponse)`

### `aiserver.v1.RequestReplayService`

- `Health(RequestReplayHealthRequest) returns (RequestReplayHealthResponse)`
- `RecordRequest(RecordRequestRequest) returns (RecordRequestResponse)`
- `ReplayRequest(ReplayRequestRequest) returns (ReplayRequestResponse)`

### `aiserver.v1.ReviewService`

- `StreamReview(ReviewRequestV2) returns (stream ReviewResponseV2)`
- `StreamReviewChat(ReviewChatRequestV2) returns (stream ReviewChatResponseV2)`
- `StreamSlowReview(ReviewRequestV2) returns (stream ReviewResponseV2)`
- `StreamCodeTour(StreamCodeTourRequest) returns (stream StreamCodeTourResponse)`
- `BugConfig(BugConfigRequest) returns (BugConfigResponse)`
- `StreamBugBotLinter(StreamBugBotLinterRequest) returns (stream StreamBugBotLinterResponse)`
- `StreamBugFinding(StreamBugFindingRequest) returns (stream StreamBugFindingResponse)`

### `aiserver.v1.SCMService`

- `GetPullRequest(GetPullRequestRequest) returns (GetPullRequestResponse)`
- `BatchGetPullRequests(BatchGetPullRequestsRequest) returns (BatchGetPullRequestsResponse)`
- `GetPullRequestDiff(GetPullRequestDiffRequest) returns (GetPullRequestDiffResponse)`
- `GetPullRequestChecks(GetPullRequestChecksRequest) returns (GetPullRequestChecksResponse)`
- `GetSCMPullRequestCommits(GetSCMPullRequestCommitsRequest) returns (GetSCMPullRequestCommitsResponse)`
- `GetSCMPullRequestTimelineEvents(GetSCMPullRequestTimelineEventsRequest) returns (GetSCMPullRequestTimelineEventsResponse)`
- `GetPullRequestCheckLogExcerpt(GetPullRequestCheckLogExcerptRequest) returns (GetPullRequestCheckLogExcerptResponse)`
- `GetBranchComparison(GetBranchComparisonRequest) returns (GetBranchComparisonResponse)`
- `GetPullRequestForBranch(SCMGetPullRequestForBranchRequest) returns (SCMGetPullRequestForBranchResponse)`
- `MergePullRequest(SCMMergePullRequestRequest) returns (SCMMergePullRequestResponse)`
- `UpdatePullRequestTitle(SCMUpdatePullRequestTitleRequest) returns (SCMUpdatePullRequestTitleResponse)`
- `MakePullRequestReady(SCMMakePullRequestReadyRequest) returns (SCMMakePullRequestReadyResponse)`
- `ClosePullRequest(SCMClosePullRequestRequest) returns (SCMClosePullRequestResponse)`
- `ReopenPullRequest(SCMReopenPullRequestRequest) returns (SCMReopenPullRequestResponse)`
- `EnablePullRequestAutoMerge(SCMEnablePullRequestAutoMergeRequest) returns (SCMEnablePullRequestAutoMergeResponse)`
- `DisablePullRequestAutoMerge(SCMDisablePullRequestAutoMergeRequest) returns (SCMDisablePullRequestAutoMergeResponse)`
- `GetPullRequestCodeowners(GetPullRequestCodeownersRequest) returns (GetPullRequestCodeownersResponse)`

### `aiserver.v1.SchedulerService`

- `Acquire(AcquireRequest) returns (AcquireResponse)`
- `ReportUsage(ReportUsageRequest) returns (ReportUsageResponse)`

### `aiserver.v1.ServerConfigService`

- `GetServerConfig(GetServerConfigRequest) returns (GetServerConfigResponse)`

### `aiserver.v1.ShadowWorkspaceService`

- `GetLintsForChange(GetLintsForChangeRequest) returns (GetLintsForChangeResponse)`
- `ShadowHealthCheck(ShadowHealthCheckRequest) returns (ShadowHealthCheckResponse)`
- `SwSyncIndex(SwSyncIndexRequest) returns (SwSyncIndexResponse)`
- `SwProvideTemporaryAccessToken(SwProvideTemporaryAccessTokenRequest) returns (SwProvideTemporaryAccessTokenResponse)`
- `SwCompileRepoIncludeExcludePatterns(SwCompileRepoIncludeExcludePatternsRequest) returns (SwCompileRepoIncludeExcludePatternsResponse)`
- `SwCallClientSideV2Tool(SwCallClientSideV2ToolRequest) returns (SwCallClientSideV2ToolResponse)`
- `SwGetExplicitContext(SwGetExplicitContextRequest) returns (SwGetExplicitContextResponse)`
- `SwWriteTextFileWithLints(SwWriteTextFileWithLintsRequest) returns (SwWriteTextFileWithLintsResponse)`
- `SwGetEnvironmentInfo(SwGetEnvironmentInfoRequest) returns (SwGetEnvironmentInfoResponse)`
- `SwGetLinterErrors(SwGetLinterErrorsRequest) returns (SwGetLinterErrorsResponse)`
- `SwGetMcpTools(SwGetMcpToolsRequest) returns (SwGetMcpToolsResponse)`
- `SwTrackModel(SwTrackModelRequest) returns (SwTrackModelResponse)`
- `SwCallDiagnosticsExecutor(SwCallDiagnosticsExecutorRequest) returns (SwCallDiagnosticsExecutorResponse)`

### `aiserver.v1.TeamCreditsService`

- `GetTeamCredits(GetTeamCreditsRequest) returns (GetTeamCreditsResponse)`
- `SetTeamCredits(SetTeamCreditsRequest) returns (SetTeamCreditsResponse)`
- `ClearTeamCredits(ClearTeamCreditsRequest) returns (ClearTeamCreditsResponse)`

### `aiserver.v1.ToolCallEventService`

- `SubmitToolCallEvents(SubmitToolCallEventsRequest) returns (SubmitToolCallEventsResponse)`

### `aiserver.v1.TraceService`

- `SubmitSpans(SubmitSpansRequest) returns (SubmitSpansResponse)`

### `aiserver.v1.UploadService`

- `UploadDocumentation(NewDocumentationRequest) returns (UploadResponse)`
- `UploadDocumentationStatus(UploadDocumentationRequest) returns (UploadedStatus)`
- `MarkAsPublic(MarkAsPublicRequest) returns (UploadedStatus)`
- `UploadStatus(UploadedStatusRequest) returns (UploadedStatus)`
- `GetPages(GetPagesRequest) returns (Pages)`
- `GetDoc(GetDocRequest) returns (ProtoDoc)`
- `RescrapeDocs(RescrapeDocsRequest) returns (RescrapeDocsResponse)`
- `RescrapeDocsV2(RescrapeDocsRequestV2) returns (RescrapeDocsResponse)`
- `UpsertAllDocs(UpsertDocsRequest) returns (UpsertDocsResponse)`

### `aiserver.v1.UsageSimulationService`

- `GetSimulation(GetSimulationRequest) returns (GetSimulationResponse)`
- `SetSimulation(SetSimulationRequest) returns (SetSimulationResponse)`
- `ClearSimulation(ClearSimulationRequest) returns (ClearSimulationResponse)`
- `GetAllSimulations(GetAllSimulationsRequest) returns (GetAllSimulationsResponse)`
- `AddSyntheticUsage(AddSyntheticUsageRequest) returns (AddSyntheticUsageResponse)`

### `aiserver.v1.VmDaemonService`

- `SyncIndex(SyncIndexRequest) returns (SyncIndexResponse)`
- `CompileRepoIncludeExcludePatterns(CompileRepoIncludeExcludePatternsRequest) returns (CompileRepoIncludeExcludePatternsResponse)`
- `Upgrade(UpgradeRequest) returns (UpgradeResponse)`
- `Ping(PingRequest) returns (PingResponse)`
- `Exec(ExecRequest) returns (ExecResponse)`
- `CallClientSideV2Tool(CallClientSideV2ToolRequest) returns (CallClientSideV2ToolResponse)`
- `ReadTextFile(ReadTextFileRequest) returns (ReadTextFileResponse)`
- `WriteTextFile(WriteTextFileRequest) returns (WriteTextFileResponse)`
- `GetFileStats(GetFileStatsRequest) returns (GetFileStatsResponse)`
- `GetExplicitContext(GetExplicitContextRequest) returns (GetExplicitContextResponse)`
- `GetEnvironmentInfo(GetEnvironmentInfoRequest) returns (GetEnvironmentInfoResponse)`
- `ProvideTemporaryAccessToken(ProvideTemporaryAccessTokenRequest) returns (ProvideTemporaryAccessTokenResponse)`
- `WarmCursorServer(WarmCursorServerRequest) returns (WarmCursorServerResponse)`
- `RefreshGitHubAccessToken(RefreshGitHubAccessTokenRequest) returns (RefreshGitHubAccessTokenResponse)`
- `GetWorkspaceChangesHash(GetWorkspaceChangesHashRequest) returns (GetWorkspaceChangesHashResponse)`
- `GetDiff(GetDiffRequest) returns (GetDiffResponse)`
- `GetLinterErrors(GetLinterErrorsRequest) returns (GetLinterErrorsResponse)`
- `GetLogs(GetLogsRequest) returns (GetLogsResponse)`
- `InstallExtensions(InstallExtensionsRequest) returns (InstallExtensionsResponse)`
- `GetMcpTools(GetMcpToolsRequest) returns (GetMcpToolsResponse)`
- `TrackModel(TrackModelRequest) returns (TrackModelResponse)`
- `CallDiagnosticsExecutor(CallDiagnosticsExecutorRequest) returns (CallDiagnosticsExecutorResponse)`

### `aiserver.v1.WebProfilingService`

- `SubmitInteractionWindow(SubmitInteractionWindowRequest) returns (SubmitInteractionWindowResponse)`
