export type WorkflowPresetId =
  | 'default'
  | 'requirements'
  | 'smoke'
  | 'web-regression'
  | 'app-regression'
  | 'simple-api'
  | 'complex-api'
  | 'bug-regression'
  | 'coverage-round-two'
  | 'important-release'
  | 'full-release'
  | 'seo'
  | 'performance'
  | 'diagnosis';
export type WorkflowRunMode = 'interactive' | 'one-shot' | 'loop' | 'ci' | 'loop-ci';
export type WorkflowRound = 'first' | 'later' | 'bug-only' | 'continuous';
export type ReleaseLevel = 'simple' | 'normal' | 'important' | 'release';
export type TestEnvironment = 'local' | 'development' | 'test' | 'staging' | 'production';
export type TestScope =
  | 'e2e'
  | 'web'
  | 'app'
  | 'api'
  | 'seo'
  | 'performance'
  | 'security'
  | 'unit'
  | 'integration'
  | 'network';
export type InputSource = 'description' | 'prd' | 'design' | 'diff' | 'api' | 'bug' | 'logs' | 'attachments';
export type WorkflowAction = 'analyze' | 'cases' | 'plan' | 'execute' | 'zentao' | 'report' | 'assets' | 'diagnose';
export type RiskEnhancement =
  | 'idempotency'
  | 'concurrency'
  | 'unique-id'
  | 'transaction'
  | 'retry'
  | 'async'
  | 'cache'
  | 'field-chain';
export type ApiExecutor = 'auto' | 'pytest' | 'apifox' | 'http';
export type DataCreationPolicy = 'controlled' | 'forbidden';
export type DataCleanupPolicy = 'retain' | 'cleanup';
export type DataNotesMode = 'auto' | 'manual';

export interface WorkflowPermissions {
  executeTests: boolean;
  productionWrite: boolean;
  zentaoWrite: boolean;
  apifoxModify: boolean;
  retainAssets: boolean;
}

export interface PromptWorkflowConfig {
  presetId: string;
  presetLabel?: string;
  runMode: WorkflowRunMode;
  round: WorkflowRound;
  releaseLevel: ReleaseLevel;
  environment: TestEnvironment;
  project: string;
  service: string;
  versionBranch: string;
  targetBranch: string;
  testNotes: string;
  scopes: TestScope[];
  apiExecutor: ApiExecutor;
  inputSources: InputSource[];
  productDocKeywords: string;
  technicalDocKeywords: string;
  dataCreation: DataCreationPolicy;
  dataCleanup: DataCleanupPolicy;
  dataNotesMode: DataNotesMode;
  dataNotes: string;
  actions: WorkflowAction[];
  risks: RiskEnhancement[];
  permissions: WorkflowPermissions;
}

export interface WorkflowPreset {
  id: WorkflowPresetId;
  name: string;
  description: string;
  config: PromptWorkflowConfig;
}

export interface CustomWorkflowPreset {
  id: string;
  name: string;
  config: PromptWorkflowConfig;
  createdAt: number;
}

export interface GeneratedWorkflowPrompt {
  prompt: string;
  badges: string[];
  skillRoute: string[];
}

export const runModeLabels: Record<WorkflowRunMode, string> = {
  interactive: '默认工作流 · 交互式流水线',
  'one-shot': '默认工作流 · 一次性执行',
  loop: 'Loop 自动外环',
  ci: 'CI/CD 门禁',
  'loop-ci': 'Loop 自动外环 + CI/CD 门禁'
};
export const roundLabels: Record<WorkflowRound, string> = {
  first: '第一轮',
  later: '第二轮及以后',
  'bug-only': '仅失败/Bug 回归',
  continuous: '持续多轮'
};
export const releaseLevelLabels: Record<ReleaseLevel, string> = {
  simple: '简单版本',
  normal: '普通版本',
  important: '复杂/重要版本',
  release: '核心链路/发布前版本'
};
export const environmentLabels: Record<TestEnvironment, string> = {
  local: '本地环境',
  development: '开发环境',
  test: '测试环境',
  staging: '灰度/预发布环境',
  production: '线上/生产环境'
};
export const scopeLabels: Record<TestScope, string> = {
  e2e: '功能/E2E',
  web: 'Web UI',
  app: 'App UI',
  api: 'API',
  seo: 'SEO',
  performance: '性能',
  security: '安全',
  unit: '单元',
  integration: '集成',
  network: '网络'
};
export const apiExecutorLabels: Record<ApiExecutor, string> = {
  auto: '自动选择',
  pytest: 'pytest CLI',
  apifox: 'Apifox CLI',
  http: '一次性 HTTP'
};
export const inputSourceLabels: Record<InputSource, string> = {
  description: '用户本轮描述',
  prd: '需求/PRD',
  design: '开发设计文档',
  diff: '代码 Diff/分支变更',
  api: 'OpenAPI/Swagger/Apifox/curl',
  bug: 'Bug/缺陷',
  logs: '日志/SLS',
  attachments: '截图/附件'
};
export const actionLabels: Record<WorkflowAction, string> = {
  analyze: '分析需求和验收口径',
  cases: '生成完整测试用例',
  plan: '生成测试计划和执行矩阵',
  execute: '执行测试',
  zentao: '写回禅道',
  report: '输出测试报告',
  assets: '沉淀长期自动化资产',
  diagnose: '执行系统化问题诊断'
};
export const riskLabels: Record<RiskEnhancement, string> = {
  idempotency: '幂等、重复请求、重复回调',
  concurrency: '并发竞争窗口和同一起跑验证',
  'unique-id': '唯一 ID、雪花算法、时钟回拨和唯一约束',
  transaction: '事务边界、行锁/表锁证据、死锁和跨库一致性',
  retry: '超时重试、迟到成功、冲正和补偿',
  async: '回调、MQ、异步任务、重复/乱序消息和 ACK 丢失',
  cache: 'Redis/缓存、TTL、刷新和重建',
  'field-chain': '来源真值到服务、API、页面或业务动作的字段链路'
};

const baseConfig: PromptWorkflowConfig = {
  presetId: 'default',
  presetLabel: '默认功能自动化',
  runMode: 'interactive',
  round: 'first',
  releaseLevel: 'normal',
  environment: 'test',
  project: '',
  service: '',
  versionBranch: '',
  targetBranch: '',
  testNotes: '',
  scopes: ['e2e'],
  apiExecutor: 'auto',
  inputSources: ['description', 'prd'],
  productDocKeywords: '',
  technicalDocKeywords: '',
  dataCreation: 'controlled',
  dataCleanup: 'retain',
  dataNotesMode: 'auto',
  dataNotes: '',
  actions: ['cases', 'plan', 'execute', 'report'],
  risks: ['field-chain'],
  permissions: {
    executeTests: true,
    productionWrite: false,
    zentaoWrite: false,
    apifoxModify: false,
    retainAssets: false
  }
};

export const defaultWorkflowConfig = cloneWorkflowConfig(baseConfig);

function preset(
  id: WorkflowPresetId,
  name: string,
  description: string,
  overrides: Partial<Omit<PromptWorkflowConfig, 'permissions'>> & { permissions?: Partial<WorkflowPermissions> } = {}
): WorkflowPreset {
  return {
    id,
    name,
    description,
    config: {
      ...cloneWorkflowConfig(baseConfig),
      ...overrides,
      presetId: id,
      presetLabel: name,
      scopes: overrides.scopes ? [...overrides.scopes] : [...baseConfig.scopes],
      inputSources: overrides.inputSources ? [...overrides.inputSources] : [...baseConfig.inputSources],
      actions: overrides.actions ? [...overrides.actions] : [...baseConfig.actions],
      risks: overrides.risks ? [...overrides.risks] : [...baseConfig.risks],
      permissions: { ...baseConfig.permissions, ...overrides.permissions }
    }
  };
}

export const workflowPresets: WorkflowPreset[] = [
  preset('default', '默认功能自动化', '普通自动化的默认入口：先做功能/E2E，再按输入和风险决定是否扩展。'),
  preset('requirements', '需求分析与用例设计', '只分析需求、验收口径并生成用例与计划，不执行真实测试。', {
    inputSources: ['description', 'prd', 'design'],
    actions: ['analyze', 'cases', 'plan'],
    permissions: { executeTests: false }
  }),
  preset('smoke', '快速冒烟', '范围明确时一次性执行低风险 Web 冒烟，并输出简洁报告。', {
    runMode: 'one-shot',
    releaseLevel: 'simple',
    scopes: ['e2e', 'web'],
    inputSources: ['description'],
    actions: ['plan', 'execute', 'report'],
    risks: []
  }),
  preset('web-regression', 'Web 功能回归', 'Web 页面功能回归，覆盖验收链路、页面证据和字段传递。', {
    scopes: ['e2e', 'web'],
    inputSources: ['prd', 'bug', 'attachments']
  }),
  preset('app-regression', 'App 功能回归', 'App 功能与多端回归；底层设备矩阵仍由对应 App 工作流决定。', {
    scopes: ['e2e', 'app'],
    inputSources: ['prd', 'design', 'diff', 'bug']
  }),
  preset('simple-api', '简单 API · Apifox', '简单接口版本默认使用 Apifox CLI，生成用例后直接执行。', {
    runMode: 'one-shot',
    releaseLevel: 'simple',
    scopes: ['api'],
    apiExecutor: 'apifox',
    inputSources: ['description', 'prd', 'api']
  }),
  preset('complex-api', '复杂 API · pytest', '复杂接口版本使用 pytest CLI，并强化代码、契约、事务和异步风险分析。', {
    releaseLevel: 'important',
    scopes: ['api', 'integration'],
    apiExecutor: 'pytest',
    inputSources: ['prd', 'design', 'diff', 'api', 'bug'],
    actions: ['analyze', 'cases', 'plan', 'execute', 'report'],
    risks: ['idempotency', 'concurrency', 'unique-id', 'transaction', 'retry', 'async', 'cache', 'field-chain']
  }),
  preset('bug-regression', '失败项/Bug 回归', '聚焦上一轮失败项和已知 Bug；默认不扩大为全部专项测试。', {
    runMode: 'one-shot',
    round: 'bug-only',
    inputSources: ['bug', 'logs', 'attachments'],
    actions: ['cases', 'plan', 'execute', 'report', 'diagnose']
  }),
  preset('coverage-round-two', '第二轮 AI 未覆盖补测', '先读取上一轮失败/阻塞项和 AI 未覆盖日志，再生成补充测试并复跑。', {
    round: 'later',
    scopes: ['e2e', 'web', 'api'],
    inputSources: ['diff', 'bug', 'logs'],
    risks: ['field-chain', 'retry']
  }),
  preset('important-release', '复杂/重要版本', '需求、设计、代码和 API 联合分析，叠加攻击性风险及完整测试报告。', {
    releaseLevel: 'important',
    scopes: ['e2e', 'web', 'api', 'integration'],
    apiExecutor: 'pytest',
    inputSources: ['prd', 'design', 'diff', 'api', 'bug'],
    actions: ['analyze', 'cases', 'plan', 'execute', 'report'],
    risks: ['idempotency', 'concurrency', 'unique-id', 'transaction', 'retry', 'async', 'cache', 'field-chain']
  }),
  preset('full-release', '发布前全量回归', '发布前多层回归并启用 Loop + CI；单元默认跳过，性能和安全由该预设显式启用。', {
    runMode: 'loop-ci',
    round: 'continuous',
    releaseLevel: 'release',
    scopes: ['e2e', 'web', 'app', 'api', 'seo', 'performance', 'security', 'integration'],
    apiExecutor: 'pytest',
    inputSources: ['prd', 'design', 'diff', 'api', 'bug', 'logs'],
    actions: ['analyze', 'cases', 'plan', 'execute', 'report'],
    risks: ['idempotency', 'concurrency', 'unique-id', 'transaction', 'retry', 'async', 'cache', 'field-chain']
  }),
  preset('seo', 'SEO 测试', '将 SEO 作为独立测试层，覆盖页面元信息、抓取、索引和可发现性。', {
    scopes: ['seo'],
    inputSources: ['description', 'prd']
  }),
  preset('performance', '性能专项', '显式启用性能专项；压测模型、阈值、并发和时长仍由你继续配置。', {
    scopes: ['performance'],
    inputSources: ['prd', 'design', 'diff', 'logs'],
    risks: ['concurrency', 'async', 'cache']
  }),
  preset('diagnosis', '问题诊断', '按证据驱动的系统化诊断推进，只生成诊断结论和报告，不默认执行测试。', {
    inputSources: ['diff', 'bug', 'logs', 'attachments'],
    actions: ['diagnose', 'report'],
    permissions: { executeTests: false }
  })
];

export function cloneWorkflowConfig(config: PromptWorkflowConfig): PromptWorkflowConfig {
  return {
    ...config,
    scopes: [...config.scopes],
    inputSources: [...config.inputSources],
    actions: [...config.actions],
    risks: [...config.risks],
    permissions: { ...config.permissions }
  };
}

export function getWorkflowPreset(id: string) {
  return workflowPresets.find((item) => item.id === id);
}

export function buildWorkflowPrompt(input: PromptWorkflowConfig): GeneratedWorkflowPrompt {
  const config = normalizeConfig(input);
  const presetName =
    config.presetLabel?.trim() ||
    getWorkflowPreset(config.presetId)?.name ||
    (config.presetId === 'custom' ? '自定义组合' : '本地自定义模板');
  const complexVersion = config.releaseLevel === 'important' || config.releaseLevel === 'release';
  const laterRound = config.round !== 'first';
  const actualExecution = config.permissions.executeTests && config.actions.includes('execute');
  const productionLike = config.environment === 'staging' || config.environment === 'production';
  const loopEnabled = config.runMode === 'loop' || config.runMode === 'loop-ci';
  const ciEnabled = config.runMode === 'ci' || config.runMode === 'loop-ci';
  const productKeywords = multilineEntries(config.productDocKeywords);
  const technicalKeywords = multilineEntries(config.technicalDocKeywords);
  const apiExecutor = resolveApiExecutor(config, complexVersion);
  const automaticRules: string[] = [];

  if (config.dataCreation === 'controlled') {
    automaticRules.push(
      '- 任何造数 mutation 前先生成并定稿前置数据依赖清单，补齐创建/复用、验证、run_id 和追踪字段，再调用对应业务 provider。',
      config.dataCleanup === 'cleanup'
        ? '- 清理只覆盖本轮 run_id 创建且所有权可回读的数据；清理异常写入报告，不扩大删除范围。'
        : '- 本轮造出的业务数据默认保留，变更账本记录 cleanup_status=NOT_REQUESTED。'
    );
  } else {
    automaticRules.push('- 本轮禁止造数；缺少前置数据时标记未执行/阻塞缺数据，并继续其它可执行项。');
  }
  if (productKeywords.length) {
    automaticRules.push(
      `- 使用 dws 逐条按 ${productKeywords.map((item) => `“${item}”`).join('、')} 检索钉钉产品文档、需求/PRD、验收口径、字段和状态规则；回读命中文档标题、链接、更新时间及相关段落。`
    );
  }
  if (technicalKeywords.length) {
    automaticRules.push(
      `- 使用 dws 逐条按 ${technicalKeywords.map((item) => `“${item}”`).join('、')} 检索钉钉技术文档、开发设计和技术方案；提取影响服务、API、DB/Redis/MQ、异步任务、配置及分支信息。`
    );
  }
  if (productKeywords.length && technicalKeywords.length) {
    automaticRules.push(
      '- 将产品验收点与技术实现逐项映射；候选文档有歧义时列出候选和缺口，不凭关键词猜测结论。'
    );
  }
  if (!config.project || !config.service || !config.versionBranch || !config.targetBranch) {
    automaticRules.push(
      '- 未填写的产品线、服务/仓库、版本分支和目标分支，按照需求文档、设计文档、测试说明、代码工作区及项目路由自动分析；无法唯一确定时列出候选和依据，不直接猜测。'
    );
  }
  if (config.scopes.includes('seo')) {
    automaticRules.push(
      '- 将 SEO 作为独立测试范围：优先使用产品线注册的 SEO 工作流，通用场景使用 seo skill；覆盖 title、description、canonical、robots、OG/Twitter、抓取索引和关键链接，只有需要渲染交互证据时再联动浏览器。'
    );
  }
  if (complexVersion) {
    automaticRules.push(
      '- 先读取需求和开发设计，确认影响服务/项目并执行代码/API 影响分析。',
      '- 获取版本代码影响分析；异常只备注，不中断其它测试。',
      '- 输出包含覆盖率、AI 补测、缺陷和残余风险的完整报告。'
    );
  } else {
    automaticRules.push(
      '- 不因普通版本自动扩大代码分析范围；按输入和风险决定影响分析。',
      '- 默认输出高信号摘要；只有选择测试报告时输出完整报告。'
    );
  }
  if (config.scopes.includes('api') && config.apiExecutor === 'auto') {
    automaticRules.push(
      complexVersion ? '- API 未明确指定执行器时使用 pytest CLI。' : '- API 未明确指定执行器时使用 Apifox CLI。'
    );
  }
  if (laterRound) {
    automaticRules.push(
      '- 测试前读取上一轮计划、报告、失败/阻塞项、Bug、coverage review_id 和补跑结果。',
      '- 获取/轮询上一轮 AI 未覆盖日志，转成补充测试矩阵后再执行。',
      '- AI 获取异常写入报告并继续其它复测项，不得声称 AI 补测闭环完成。',
      '- 本轮结束后再次提交覆盖率，并比较轮次变化。'
    );
  } else {
    automaticRules.push('- 本轮测试结束后提交覆盖率、保存 version_id/review_id 并触发 AI review。');
  }
  if (loopEnabled) automaticRules.push('- 使用 quality-loop-orchestrator 管理轮次、预算、租约、审批和确定性停止。');
  if (ciEnabled) {
    automaticRules.push('- 使用 quality-ci-contracts 预检策略并生成测试层门禁；单元默认跳过，性能按配置执行。');
  }
  if (productionLike) {
    automaticRules.push(
      config.permissions.productionWrite
        ? '- 当前为线上类环境：执行写操作前仍需列出账号/数据范围、影响和回滚方式。'
        : '- 当前为线上类环境：只执行只读/非破坏性验证，写操作标记受控未执行。'
    );
  }

  const lines = ['请按 QA Automation 的 DEFAULT-WORKFLOW.md 执行以下任务。'];
  if (config.testNotes) lines.push('', '【测试说明（手动输入）】', config.testNotes);
  lines.push(
    '',
    '【执行配置】',
    `- 工作流模式：${presetName}`,
    `- 运行方式：${runModeLabels[config.runMode]}`,
    `- 测试轮次：${roundLabels[config.round]}`,
    `- 版本级别：${releaseLevelLabels[config.releaseLevel]}`,
    `- 环境：${environmentLabels[config.environment]}`,
    `- 项目/产品线：${config.project || '按照需求文档、设计文档和测试说明自动分析'}`,
    `- 服务/仓库：${config.service || '按照需求文档、设计文档、测试说明和工作区路由自动分析'}`,
    `- 版本分支：${config.versionBranch || '按照需求文档、设计文档、测试说明和代码工作区自动分析'}`,
    `- 目标分支：${config.targetBranch || '按照需求文档、设计文档、测试说明和项目路由自动分析'}`,
    '',
    '【输入依据】',
    ...bulletLines(config.inputSources.map((item) => inputSourceLabels[item]))
  );
  if (productKeywords.length || technicalKeywords.length) {
    lines.push('', '【钉钉文档检索】');
    productKeywords.forEach((item, index) => lines.push(`- 钉钉产品文档关键词 ${index + 1}：${item}`));
    technicalKeywords.forEach((item, index) => lines.push(`- 钉钉技术文档关键词 ${index + 1}：${item}`));
  }
  lines.push('', '【前置数据与造数策略】');
  if (config.dataCreation === 'controlled') {
    lines.push(
      '- 是否允许造数：允许测试环境受控造数',
      config.dataCleanup === 'cleanup'
        ? '- 造数后处理：测试执行后按本轮 run_id 生成清理计划，先 dry-run，再按依赖逆序清理并回查'
        : '- 造数后处理：默认保留，不自动删除、撤销或回收；需要清理时由用户另行明确同步'
    );
  } else {
    lines.push('- 是否允许造数：不允许造数', '- 造数后处理：不适用，本轮不得创建或修改测试数据');
  }
  if (config.dataNotesMode === 'manual') {
    lines.push(
      config.dataNotes
        ? `${config.dataCreation === 'controlled' ? '- 造数补充说明：' : '- 前置数据补充说明（不构成造数授权）：'}${config.dataNotes}`
        : '- 造数补充说明：已选择需要补充，但当前未填写；执行前标记待补充'
    );
  } else {
    lines.push('- 造数补充说明：无需手动补充，按照需求文档、设计文档、测试说明和业务 provider 自动分析');
  }
  lines.push(
    '',
    '【任务动作】',
    ...bulletLines(config.actions.map((item) => actionLabels[item])),
    '',
    '【测试范围】',
    ...bulletLines(config.scopes.map((item) => scopeLabels[item]))
  );
  if (config.scopes.includes('api')) lines.push(`- API 主执行器：${apiExecutor}`);
  lines.push(
    '',
    '【攻击性风险增强】',
    ...bulletLines(config.risks.map((item) => riskLabels[item])),
    '',
    '【自动路由规则】',
    ...automaticRules,
    '',
    '【权限边界】',
    `- 测试执行：${config.permissions.executeTests ? '允许' : '不允许，只生成计划/用例'}`,
    `- 测试环境造数：${config.dataCreation === 'controlled' ? '允许受控执行' : '不允许'}`,
    `- 线上写操作：${config.permissions.productionWrite ? '已授权，但仍需限定范围和回滚方式' : '不允许，线上默认只读'}`,
    `- 禅道写回：${config.permissions.zentaoWrite ? '允许' : '不允许，仅输出待写回清单'}`,
    `- Apifox 资产修改：${config.permissions.apifoxModify ? '允许，修改后必须回读' : '不允许，只查询/执行已有资产'}`,
    `- 长期资产沉淀：${config.permissions.retainAssets ? '允许' : '不允许，仅保留本轮证据'}`,
    actualExecution
      ? '- 覆盖率：测试执行后必须主动提交；异常写入报告并继续，不阻断正常测试'
      : '- 覆盖率：本轮不执行测试，不提交且不伪造覆盖率结果',
    '',
    '【执行与报告要求】',
    '- 每条用例保留来源、前置数据、步骤、预期、断言证据、执行器和状态。',
    '- 缺数据、缺权限、平台异常或断言不足只影响对应项，继续其它可执行测试。',
    '- 不用接口 200、字段存在、页面 toast 或单一 DB 查询冒充业务闭环通过。',
    '- 最终输出测试结论、失败/阻塞、证据路径、覆盖率/AI 状态和后续入口。'
  );

  return {
    prompt: lines.join('\n'),
    badges: buildBadges(config, {
      actualExecution,
      laterRound,
      complexVersion,
      productionLike,
      loopEnabled,
      ciEnabled,
      apiExecutor,
      productKeywords,
      technicalKeywords
    }),
    skillRoute: buildSkillRoute(config, apiExecutor)
  };
}

function buildSkillRoute(config: PromptWorkflowConfig, apiExecutor: string) {
  const route = ['qa-test-orchestrator：统一入口、任务状态和跨域交接'];
  if (config.scopes.some((item) => item === 'e2e' || item === 'web' || item === 'seo')) {
    route.push('e2e-test-master：功能测试设计、覆盖矩阵和 E2E 计划');
  }
  if (config.scopes.includes('api')) {
    route.push(`api-test-master：API 测试总控；主执行器使用 ${apiExecutor}`);
    if (apiExecutor.startsWith('Apifox')) route.push('apifox-workflow：执行已有 Apifox 资产');
    if (apiExecutor.startsWith('pytest')) route.push('api-pytest-template：复用或生成 pytest 执行骨架');
  }
  if (config.scopes.includes('app')) route.push('appium-mobile-executor：Appium 移动端执行');
  if (config.scopes.includes('performance')) route.push('performance-test-master：性能专项');
  if (config.scopes.includes('security')) route.push('security-test-master：安全专项');
  if (config.scopes.includes('unit')) route.push('unit-test-master：单元专项');
  if (config.scopes.includes('integration')) route.push('integration-test-master：集成专项');
  if (config.scopes.includes('network')) route.push('skills-network：网络专项');
  if (config.dataCreation === 'controlled') route.push('prepare-test-data：前置数据依赖与受控造数');
  if (config.actions.includes('report')) route.push('test-report-master：统一测试报告');
  if (config.actions.includes('zentao')) route.push('zentao-assistant-v2：禅道写回');
  if (config.inputSources.includes('logs')) route.push('alibabacloud-sls-query：SLS 日志证据');
  if (config.runMode === 'loop' || config.runMode === 'loop-ci') {
    route.push('quality-loop-orchestrator：可恢复多轮自动外环');
  }
  if (config.runMode === 'ci' || config.runMode === 'loop-ci') {
    route.push('quality-ci-contracts：CI/CD 质量策略与门禁');
  }
  return route;
}

interface DerivedBadges {
  actualExecution: boolean;
  laterRound: boolean;
  complexVersion: boolean;
  productionLike: boolean;
  loopEnabled: boolean;
  ciEnabled: boolean;
  apiExecutor: string;
  productKeywords: string[];
  technicalKeywords: string[];
}

function buildBadges(config: PromptWorkflowConfig, derived: DerivedBadges) {
  const badges = [
    derived.actualExecution ? '执行后固定提交覆盖率' : '未执行测试，不伪造覆盖率',
    derived.laterRound ? '先取上一轮 AI 未覆盖日志' : '首轮触发 AI review',
    derived.complexVersion ? '追加版本代码影响分析' : '无需强制版本影响分析'
  ];
  if (config.scopes.includes('api')) badges.push(`API：${derived.apiExecutor}`);
  badges.push(config.dataCreation === 'controlled' ? '允许测试环境受控造数' : '本轮禁止造数');
  if (config.dataCreation === 'controlled') {
    badges.push(config.dataCleanup === 'cleanup' ? '造数后按 run_id 清理' : '造数后默认保留');
  }
  if (config.dataNotesMode === 'manual' && !config.dataNotes) badges.push('待补充造数说明');
  if (config.scopes.includes('seo')) badges.push('SEO 独立测试范围');
  if (derived.productKeywords.length) badges.push('检索钉钉产品文档');
  if (derived.technicalKeywords.length) badges.push('检索钉钉技术文档');
  if (derived.productionLike && !config.permissions.productionWrite) badges.push('线上默认只读');
  if (derived.loopEnabled) badges.push('启用可恢复多轮外环');
  if (derived.ciEnabled) badges.push('启用 CI 质量门禁');
  return badges;
}

function normalizeConfig(input: PromptWorkflowConfig) {
  const config = cloneWorkflowConfig(input);
  config.project = config.project.trim();
  config.service = config.service.trim();
  config.versionBranch = config.versionBranch.trim();
  config.targetBranch = config.targetBranch.trim();
  config.testNotes = config.testNotes.trim();
  config.dataNotes = config.dataNotes.trim();
  if (!config.scopes.length) config.scopes = ['e2e'];
  if (!config.inputSources.length) config.inputSources = ['description'];
  if (!config.actions.length) config.actions = ['plan'];
  return config;
}

function resolveApiExecutor(config: PromptWorkflowConfig, complexVersion: boolean) {
  if (!config.scopes.includes('api')) return '未启用 API 测试';
  if (config.apiExecutor !== 'auto') return apiExecutorLabels[config.apiExecutor];
  return complexVersion ? 'pytest CLI（复杂版本默认）' : 'Apifox CLI（普通/简单版本默认）';
}

function multilineEntries(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bulletLines(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`) : ['- 无额外选择'];
}
