import {
  buildWorkflowPrompt,
  getWorkflowPreset,
  runModeLabels,
  scopeLabels,
  workflowPresets,
  type TestScope,
  type WorkflowPresetId,
  type WorkflowRunMode
} from './qaPromptWorkflow.js';

export interface KeywordTriggerRule {
  primary: readonly string[];
  secondary: readonly string[];
  negative?: readonly string[];
  examples: readonly string[];
  minimumScore: number;
  priority: number;
}

export interface QaWorkflowCatalogEntry {
  id: WorkflowPresetId;
  name: string;
  description: string;
  runMode: WorkflowRunMode;
  scopes: readonly TestScope[];
  skillRoute: readonly string[];
  trigger: KeywordTriggerRule;
}

export interface WorkflowKeywordMatch<TId extends string> {
  id: TId;
  score: number;
  confidence: 'high' | 'medium' | 'low' | 'fallback';
  matchedKeywords: string[];
  excludedKeywords: string[];
}

export interface QaWorkflowIntentResolution {
  presetId: WorkflowPresetId;
  runMode: WorkflowRunMode;
  explicitScopes: TestScope[];
  presetMatch: WorkflowKeywordMatch<WorkflowPresetId>;
  presetCandidates: WorkflowKeywordMatch<WorkflowPresetId>[];
  runModeMatch?: WorkflowKeywordMatch<WorkflowRunMode>;
}

const workflowTriggerRules = {
  default: trigger(
    ['默认功能自动化', '功能测试', 'e2e测试', '端到端测试', '自动化测试', '普通功能回归'],
    ['功能', 'e2e', '端到端', '主流程', '业务流程', '回归'],
    ['跑一下功能测试并输出报告', '做一轮普通 E2E 自动化回归'],
    6,
    10
  ),
  requirements: trigger(
    ['需求分析', '用例设计', '测试用例设计', '验收口径', '只生成用例', '只出测试计划'],
    ['需求', 'prd', '用例', '测试计划', '验收标准', '不执行测试'],
    ['分析需求并设计测试用例，不执行真实测试', '根据 PRD 整理验收口径和测试计划'],
    6,
    60
  ),
  smoke: trigger(
    ['快速冒烟', '冒烟测试', 'smoke测试', '主链路冒烟', '核心流程冒烟'],
    ['快速', '冒烟', 'smoke', '主链路', '低风险'],
    ['快速跑一遍 Web 主链路冒烟', '做一次 smoke 测试并给出简洁报告'],
    6,
    70
  ),
  'web-regression': trigger(
    ['web回归', 'web测试', '网页回归', '网页测试', '页面回归', '浏览器回归', 'webui测试'],
    ['web', '网页', '页面', '浏览器', '前端', 'ui'],
    ['回归 Web 页面和字段传递', '执行浏览器端功能回归并保留页面证据'],
    6,
    65
  ),
  'app-regression': trigger(
    ['app回归', 'app测试', '移动端回归', '移动端测试', 'android测试', 'ios测试', '安卓回归'],
    ['app', '移动端', 'android', 'ios', '安卓', '苹果端', '多端'],
    ['执行 App 功能和多端回归', '回归 Android 与 iOS 核心流程'],
    6,
    65
  ),
  'simple-api': trigger(
    ['简单api', '简单接口', '接口测试', 'api测试', '接口冒烟', 'apifox', '单接口验证'],
    ['api', '接口', 'openapi', 'swagger', 'curl', 'apifox cli'],
    ['用 Apifox CLI 跑简单接口测试', '根据 Swagger 生成并执行普通 API 用例'],
    6,
    55,
    ['复杂接口', '复杂api', 'pytest', '幂等', '并发', '事务', '异步', 'mq', '集成']
  ),
  'complex-api': trigger(
    ['复杂api', '复杂接口', 'pytest', '契约测试', '接口集成测试', 'api集成测试'],
    ['api', '接口', '幂等', '并发', '事务', '锁', '异步', 'mq', '重试', '补偿', '缓存'],
    ['用 pytest 验证复杂支付接口的幂等、事务和异步回调', '执行 API 契约与集成测试'],
    6,
    80
  ),
  'bug-regression': trigger(
    ['bug回归', '缺陷回归', '失败项回归', '问题单回归', '仅回归失败项', '回归已修复问题'],
    ['bug', '缺陷', '失败项', '已修复', '复现', '回归验证'],
    ['只回归上一轮失败项和已修复 Bug', '验证缺陷单是否修复并输出证据'],
    6,
    85
  ),
  'coverage-round-two': trigger(
    ['第二轮补测', '二轮补测', 'ai未覆盖', '未覆盖补测', '覆盖率补测', '补充测试并复跑'],
    ['第二轮', '二轮', '补测', '复跑', '未覆盖', 'coverage', 'ai review'],
    ['读取第一轮 AI 未覆盖日志并进行第二轮补测', '根据上一轮失败和 coverage 结果补充用例后复跑'],
    6,
    90
  ),
  'important-release': trigger(
    ['重要版本', '复杂版本', '核心版本', '大版本测试', '重大改造', '跨服务改造'],
    ['重要', '复杂', '核心链路', '跨服务', '影响分析', '代码diff', '完整报告'],
    ['对复杂重要版本做需求、设计、代码和 API 联合分析', '核心链路改造需要攻击性风险测试'],
    6,
    75
  ),
  'full-release': trigger(
    ['发布前全量回归', '全量回归', '上线前回归', '发版回归', '发布门禁', '上线门禁'],
    ['发布前', '上线前', '发版', '全量', '发布', '上线', '门禁', 'loop', 'ci'],
    ['发布前执行全量回归并启用 Loop 与 CI 门禁', '上线前覆盖 Web、App、API、性能和安全测试'],
    6,
    100
  ),
  seo: trigger(
    ['seo测试', 'seo专项', '搜索引擎优化测试', '抓取索引测试', '页面可发现性测试'],
    ['seo', 'title', 'description', 'canonical', 'robots', '索引', '抓取', '可发现性'],
    ['检查站点 SEO 元信息、抓取和索引', '执行 canonical、robots 与关键链接测试'],
    6,
    80
  ),
  performance: trigger(
    ['性能测试', '性能专项', '压力测试', '负载测试', '压测', '容量测试'],
    ['性能', '压测', '并发', '吞吐量', '响应时间', 'p95', 'qps', '容量'],
    ['对接口进行并发压测并验证 P95 阈值', '执行容量和负载测试'],
    6,
    80
  ),
  diagnosis: trigger(
    ['问题诊断', '故障诊断', '异常排查', '问题排查', '根因分析', '定位原因', '只做诊断'],
    ['诊断', '排查', '根因', '定位', '异常', '报错', '日志分析', '不执行测试'],
    ['根据日志和代码 Diff 排查问题根因，只输出诊断报告', '定位线上异常但不执行真实测试'],
    6,
    95
  )
} satisfies Record<WorkflowPresetId, KeywordTriggerRule>;

const runModeTriggerRules = {
  interactive: trigger(
    ['交互式执行', '逐步确认', '分阶段确认', '每步确认'],
    ['交互式', '逐步', '确认后继续'],
    ['按阶段执行，每一步确认后继续'],
    6,
    20
  ),
  'one-shot': trigger(
    ['一次性执行', '单次执行', '直接执行', '一键执行', '无需确认直接跑'],
    ['一次性', '单次', '直接跑', '一键', '不需要确认'],
    ['范围明确，直接一次性执行并输出结果'],
    6,
    40
  ),
  loop: trigger(
    ['loop模式', '自动外环', '循环执行', '持续补测', '多轮循环'],
    ['loop', '循环', '持续多轮', '自动补测', '自动复跑'],
    ['启用 Loop 自动外环持续补测'],
    6,
    60
  ),
  ci: trigger(
    ['ci模式', 'ci门禁', 'cicd门禁', '质量门禁', '流水线门禁'],
    ['ci', 'ci/cd', 'cicd', '门禁', '流水线'],
    ['接入 CI/CD 流水线并生成质量门禁'],
    6,
    60
  ),
  'loop-ci': trigger(
    ['loop和ci', 'loop加ci', 'loop ci', '自动外环和ci', '循环补测加质量门禁'],
    ['loop', 'ci', '循环', '门禁', '自动外环', '流水线'],
    ['同时启用 Loop 自动外环和 CI/CD 质量门禁'],
    8,
    100
  )
} satisfies Record<WorkflowRunMode, KeywordTriggerRule>;

const scopeTriggerRules: Record<TestScope, readonly string[]> = {
  e2e: ['功能测试', 'e2e', '端到端', '业务流程', '主链路'],
  web: ['web', '网页', '页面', '浏览器', '前端ui'],
  app: ['app', '移动端', 'android', 'ios', '安卓', '苹果端'],
  api: ['api', '接口', 'openapi', 'swagger', 'curl', 'apifox', 'pytest'],
  seo: ['seo', 'canonical', 'robots', '搜索引擎', '抓取', '索引'],
  performance: ['性能', '压测', '压力测试', '负载测试', '吞吐量', 'qps', 'p95'],
  security: ['安全测试', '漏洞', '渗透', '鉴权', '越权', '注入'],
  unit: ['单元测试', 'unit test', '单测'],
  integration: ['集成测试', 'integration', '跨服务', '契约测试'],
  network: ['网络测试', '网络专项', '代理', 'dns', '丢包', '延迟']
};

export const qaWorkflowCatalog: readonly QaWorkflowCatalogEntry[] = workflowPresets.map((preset) => ({
  id: preset.id,
  name: preset.name,
  description: preset.description,
  runMode: preset.config.runMode,
  scopes: [...preset.config.scopes],
  skillRoute: buildWorkflowPrompt(preset.config).skillRoute,
  trigger: workflowTriggerRules[preset.id]
}));

export const qaRunModeCatalog = (Object.keys(runModeTriggerRules) as WorkflowRunMode[]).map((id) => ({
  id,
  name: runModeLabels[id],
  trigger: runModeTriggerRules[id]
}));

export function rankWorkflowPresetMatches(text: string): WorkflowKeywordMatch<WorkflowPresetId>[] {
  return qaWorkflowCatalog
    .map((entry) => scoreKeywordRule(text, entry.id, entry.name, entry.trigger))
    .filter((match): match is WorkflowKeywordMatch<WorkflowPresetId> => Boolean(match))
    .sort(compareMatches);
}

export function matchWorkflowPresetByKeywords(text: string): WorkflowKeywordMatch<WorkflowPresetId> {
  const matches = rankWorkflowPresetMatches(text);
  if (matches[0]) return matches[0];
  return {
    id: 'default',
    score: 0,
    confidence: 'fallback',
    matchedKeywords: [],
    excludedKeywords: []
  };
}

export function matchRunModeByKeywords(text: string): WorkflowKeywordMatch<WorkflowRunMode> | undefined {
  const matches = qaRunModeCatalog
    .map((entry) => scoreKeywordRule(text, entry.id, entry.name, entry.trigger))
    .filter((match): match is WorkflowKeywordMatch<WorkflowRunMode> => Boolean(match))
    .sort(compareMatches);

  const loopMatch = matches.find((match) => match.id === 'loop');
  const ciMatch = matches.find((match) => match.id === 'ci');
  const combinedMatch = matches.find((match) => match.id === 'loop-ci');
  if (loopMatch && ciMatch) {
    return {
      id: 'loop-ci',
      score: Math.max(combinedMatch?.score ?? 0, loopMatch.score + ciMatch.score),
      confidence: 'high',
      matchedKeywords: unique([
        ...(combinedMatch?.matchedKeywords ?? []),
        ...loopMatch.matchedKeywords,
        ...ciMatch.matchedKeywords
      ]),
      excludedKeywords: unique([
        ...(combinedMatch?.excludedKeywords ?? []),
        ...loopMatch.excludedKeywords,
        ...ciMatch.excludedKeywords
      ])
    };
  }
  return combinedMatch ?? matches[0];
}

export function detectScopesByKeywords(text: string): TestScope[] {
  const normalizedText = normalizeTriggerText(text);
  return (Object.keys(scopeTriggerRules) as TestScope[]).filter((scope) =>
    scopeTriggerRules[scope].some((keyword) => normalizedText.includes(normalizeTriggerText(keyword)))
  );
}

export function resolveQaWorkflowIntent(text: string): QaWorkflowIntentResolution {
  const presetCandidates = rankWorkflowPresetMatches(text);
  const presetMatch = presetCandidates[0] ?? matchWorkflowPresetByKeywords(text);
  const preset = getWorkflowPreset(presetMatch.id);
  if (!preset) throw new Error(`Unknown QA workflow preset: ${presetMatch.id}`);
  const runModeMatch = matchRunModeByKeywords(text);

  return {
    presetId: preset.id,
    runMode: runModeMatch?.id ?? preset.config.runMode,
    explicitScopes: detectScopesByKeywords(text),
    presetMatch,
    presetCandidates,
    runModeMatch
  };
}

export function describeQaWorkflowCatalogEntry(id: WorkflowPresetId) {
  const entry = qaWorkflowCatalog.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown QA workflow preset: ${id}`);
  return {
    ...entry,
    scopeLabels: entry.scopes.map((scope) => scopeLabels[scope])
  };
}

function trigger(
  primary: readonly string[],
  secondary: readonly string[],
  examples: readonly string[],
  minimumScore: number,
  priority: number,
  negative: readonly string[] = []
): KeywordTriggerRule {
  return { primary, secondary, negative, examples, minimumScore, priority };
}

function scoreKeywordRule<TId extends string>(
  text: string,
  id: TId,
  name: string,
  rule: KeywordTriggerRule
): WorkflowKeywordMatch<TId> | undefined {
  const normalizedText = normalizeTriggerText(text);
  if (!normalizedText) return undefined;

  const matchedPrimary = rule.primary.filter((keyword) =>
    normalizedText.includes(normalizeTriggerText(keyword))
  );
  const matchedSecondary = rule.secondary.filter((keyword) =>
    normalizedText.includes(normalizeTriggerText(keyword))
  );
  const excludedKeywords = (rule.negative ?? []).filter((keyword) =>
    normalizedText.includes(normalizeTriggerText(keyword))
  );
  const exactNameMatch = normalizedText.includes(normalizeTriggerText(name));
  const score =
    (exactNameMatch ? 10 : 0) +
    matchedPrimary.length * 6 +
    matchedSecondary.length * 2 -
    excludedKeywords.length * 8;

  if (score < rule.minimumScore) return undefined;
  return {
    id,
    score,
    confidence: score >= 12 ? 'high' : score >= 6 ? 'medium' : 'low',
    matchedKeywords: unique([...(exactNameMatch ? [name] : []), ...matchedPrimary, ...matchedSecondary]),
    excludedKeywords
  };
}

function compareMatches<TId extends string>(
  left: WorkflowKeywordMatch<TId>,
  right: WorkflowKeywordMatch<TId>
) {
  if (left.score !== right.score) return right.score - left.score;
  const leftPriority = triggerPriority(left.id);
  const rightPriority = triggerPriority(right.id);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;
  return left.id.localeCompare(right.id);
}

function triggerPriority(id: string) {
  if (id in workflowTriggerRules) return workflowTriggerRules[id as WorkflowPresetId].priority;
  if (id in runModeTriggerRules) return runModeTriggerRules[id as WorkflowRunMode].priority;
  return 0;
}

function normalizeTriggerText(value: string) {
  return value.toLocaleLowerCase('zh-CN').replace(/[^\p{L}\p{N}]+/gu, '');
}

function unique(values: string[]) {
  return [...new Set(values)];
}
