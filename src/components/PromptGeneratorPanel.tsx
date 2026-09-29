import { appStorage } from '../shared/appStorage';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clipboard,
  FilePlus2,
  GripVertical,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  actionLabels,
  apiExecutorLabels,
  buildWorkflowPrompt,
  cloneWorkflowConfig,
  defaultWorkflowConfig,
  environmentLabels,
  getWorkflowPreset,
  inputSourceLabels,
  releaseLevelLabels,
  riskLabels,
  roundLabels,
  runModeLabels,
  scopeLabels,
  workflowPresets,
  type CustomWorkflowPreset,
  type InputSource,
  type PromptWorkflowConfig,
  type RiskEnhancement,
  type TestScope,
  type WorkflowAction,
  type WorkflowPreset
} from '../shared/qaPromptWorkflow';

const CUSTOM_PRESETS_KEY = 'test-ai-assistant.prompt-workflow.custom-presets.v1';
const PRESET_ORDER_KEY = 'test-ai-assistant.prompt-workflow.preset-order.v1';
const PENDING_SCENE_CONTEXT_KEY = 'test-ai-assistant.pending-scene-context.v1';

type DisplayPreset = WorkflowPreset | CustomWorkflowPreset;

export default function PromptGeneratorPanel({ setNotice }: { setNotice: (message: string) => void }) {
  const [config, setConfig] = useState(() => cloneWorkflowConfig(defaultWorkflowConfig));
  const [customPresets, setCustomPresets] = useState<CustomWorkflowPreset[]>(loadCustomPresets);
  const [presetOrder, setPresetOrder] = useState<string[]>(loadPresetOrder);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [copied, setCopied] = useState(false);

  const allPresets = useMemo<DisplayPreset[]>(() => [...workflowPresets, ...customPresets], [customPresets]);
  const orderedPresets = useMemo(() => orderPresets(allPresets, presetOrder), [allPresets, presetOrder]);
  const generated = useMemo(() => buildWorkflowPrompt(config), [config]);
  const selectedPreset = allPresets.find((item) => item.id === config.presetId);
  const selectedDescription =
    selectedPreset && 'description' in selectedPreset
      ? selectedPreset.description
      : selectedPreset
        ? `本地模板“${selectedPreset.name}”会恢复保存时的全部页面配置；修改后可同名覆盖。`
        : '已手动调整当前组合。可以继续生成，也可以保存为本地模板。';

  useEffect(() => {
    appStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
  }, [customPresets]);

  useEffect(() => {
    appStorage.setItem(PRESET_ORDER_KEY, JSON.stringify(presetOrder));
  }, [presetOrder]);

  useEffect(() => {
    const sceneContext = appStorage.getItem(PENDING_SCENE_CONTEXT_KEY);
    if (!sceneContext) return;
    appStorage.removeItem(PENDING_SCENE_CONTEXT_KEY);
    setConfig((current) => ({
      ...current,
      testNotes: current.testNotes.trim() ? `${sceneContext}\n\n${current.testNotes}` : sceneContext,
      presetId: 'custom',
      presetLabel: '场景与记忆复用'
    }));
    setCopied(false);
    setNotice('已载入复用场景与本地记忆');
  }, [setNotice]);

  function applyPreset(id: string) {
    const builtIn = getWorkflowPreset(id);
    const custom = customPresets.find((item) => item.id === id);
    const next = builtIn?.config ?? custom?.config;
    if (!next) return;
    setConfig({
      ...cloneWorkflowConfig(next),
      presetId: id,
      presetLabel: builtIn?.name ?? custom?.name
    });
    setCopied(false);
    setNotice(`已载入工作流模板：${builtIn?.name ?? custom?.name}`);
  }

  function updateConfig<K extends keyof PromptWorkflowConfig>(key: K, value: PromptWorkflowConfig[K]) {
    setConfig((current) => ({
      ...current,
      [key]: value,
      presetId: 'custom',
      presetLabel: '自定义组合'
    }));
    setCopied(false);
  }

  function toggleListValue<T extends TestScope | InputSource | WorkflowAction | RiskEnhancement>(
    key: 'scopes' | 'inputSources' | 'actions' | 'risks',
    value: T
  ) {
    setConfig((current) => {
      const values = current[key] as T[];
      const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: next, presetId: 'custom', presetLabel: '自定义组合' };
    });
    setCopied(false);
  }

  function updatePermission(key: keyof PromptWorkflowConfig['permissions'], checked: boolean) {
    setConfig((current) => ({
      ...current,
      presetId: 'custom',
      presetLabel: '自定义组合',
      permissions: { ...current.permissions, [key]: checked }
    }));
    setCopied(false);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(generated.prompt);
      setCopied(true);
      setNotice('提示词已复制到剪贴板');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = generated.prompt;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copiedByFallback = document.execCommand('copy');
      textarea.remove();
      setCopied(copiedByFallback);
      setNotice(copiedByFallback ? '提示词已复制到剪贴板' : '复制失败，请在结果区全选后手动复制');
    }
  }

  function loadComplexExample() {
    const preset = getWorkflowPreset('coverage-round-two');
    if (!preset) return;
    setConfig({
      ...cloneWorkflowConfig(preset.config),
      presetId: 'custom',
      presetLabel: '自定义组合',
      runMode: 'loop-ci',
      releaseLevel: 'important',
      project: '订单与支付中心',
      service: 'payment-service',
      versionBranch: 'feature/payment-idempotency',
      targetBranch: 'origin/master',
      testNotes: '',
      scopes: ['e2e', 'web', 'api', 'integration'],
      inputSources: ['prd', 'design', 'diff', 'bug'],
      actions: ['analyze', 'cases', 'plan', 'execute', 'report'],
      risks: ['idempotency', 'concurrency', 'unique-id', 'transaction', 'retry', 'async']
    });
    setNotice('已载入复杂二轮示例');
  }

  function reset() {
    setConfig(cloneWorkflowConfig(defaultWorkflowConfig));
    setCopied(false);
    setNotice('已恢复默认功能自动化模板');
  }

  function saveCurrentTemplate() {
    const name = templateName.trim();
    if (!name) {
      setNotice('请先输入模板名称');
      return;
    }
    if (workflowPresets.some((item) => namesMatch(item.name, name))) {
      setNotice('内置模板只读，请使用不同的自定义模板名称');
      return;
    }
    const existing = customPresets.find((item) => namesMatch(item.name, name));
    const id = existing?.id ?? `custom-${Date.now()}`;
    const saved: CustomWorkflowPreset = {
      id,
      name,
      config: { ...cloneWorkflowConfig(config), presetId: id, presetLabel: name },
      createdAt: existing?.createdAt ?? Date.now()
    };
    setCustomPresets((items) => [...items.filter((item) => item.id !== id), saved]);
    setPresetOrder((items) => [
      ...(items.length ? items : workflowPresets.map((item) => item.id)).filter((item) => item !== id),
      id
    ]);
    setConfig({ ...cloneWorkflowConfig(saved.config), presetId: id, presetLabel: name });
    setTemplateName('');
    setNotice(`已保存本地模板：${name}`);
  }

  function resetPresetOrder() {
    setPresetOrder([...workflowPresets.map((item) => item.id), ...customPresets.map((item) => item.id)]);
    setNotice('已恢复默认工作流顺序');
  }

  function removeCustomTemplate(id: string) {
    const target = customPresets.find((item) => item.id === id);
    if (!target) return;
    setCustomPresets((items) => items.filter((item) => item.id !== id));
    setPresetOrder((items) => items.filter((item) => item !== id));
    if (config.presetId === id) {
      setConfig({
        ...cloneWorkflowConfig(config),
        presetId: 'custom',
        presetLabel: '自定义组合'
      });
    }
    setNotice(`已删除本地模板：${target.name}`);
  }

  function movePreset(id: string, direction: -1 | 1) {
    const ids = orderedPresets.map((item) => item.id);
    const index = ids.indexOf(id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    setPresetOrder(ids);
  }

  return (
    <>
      <div className="prompt-workbench">
        <section className="prompt-config-column">
          <PromptSection number="01" title="基础配置" description="决定执行方式、轮次和默认路由。">
            <div className="prompt-preset-row">
              <label className="field">
                <span>工作流模式 / 预设</span>
                <select value={config.presetId} onChange={(event) => applyPreset(event.target.value)}>
                  {config.presetId === 'custom' && <option value="custom">自定义组合（未保存）</option>}
                  {orderedPresets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button secondary" onClick={() => setTemplateDialogOpen(true)}>
                <Save size={16} />
                模板管理与排序
              </button>
            </div>
            <p className="prompt-helper">{selectedDescription}</p>

            <div className="prompt-grid four">
              <SelectField
                label="运行方式"
                value={config.runMode}
                options={runModeLabels}
                onChange={(value) => updateConfig('runMode', value as PromptWorkflowConfig['runMode'])}
              />
              <SelectField
                label="测试轮次"
                value={config.round}
                options={roundLabels}
                onChange={(value) => updateConfig('round', value as PromptWorkflowConfig['round'])}
              />
              <SelectField
                label="版本级别"
                value={config.releaseLevel}
                options={releaseLevelLabels}
                onChange={(value) => updateConfig('releaseLevel', value as PromptWorkflowConfig['releaseLevel'])}
              />
              <SelectField
                label="环境"
                value={config.environment}
                options={environmentLabels}
                onChange={(value) => updateConfig('environment', value as PromptWorkflowConfig['environment'])}
              />
            </div>

            <div className="prompt-grid four">
              <TextField label="项目 / 产品线" value={config.project} placeholder="例如：会员中心" onChange={(value) => updateConfig('project', value)} />
              <TextField label="服务 / 仓库" value={config.service} placeholder="例如：user-service" onChange={(value) => updateConfig('service', value)} />
              <TextField label="版本分支" value={config.versionBranch} placeholder="例如：feature/qa-demo" onChange={(value) => updateConfig('versionBranch', value)} />
              <TextField label="目标分支" value={config.targetBranch} placeholder="例如：origin/master" onChange={(value) => updateConfig('targetBranch', value)} />
            </div>

            <PromptSubheading>钉钉文档检索</PromptSubheading>
            <div className="prompt-grid two">
              <label className="field">
                <span>钉钉产品文档关键词（每行一组）</span>
                <textarea
                  rows={3}
                  value={config.productDocKeywords}
                  placeholder={'会员中心 V1.6 续费规则\n订单中心 优惠券验收'}
                  onChange={(event) => updateConfig('productDocKeywords', event.target.value)}
                />
              </label>
              <label className="field">
                <span>钉钉技术文档关键词（每行一组）</span>
                <textarea
                  rows={3}
                  value={config.technicalDocKeywords}
                  placeholder={'payment-service /v1/orders\n幂等与补偿设计'}
                  onChange={(event) => updateConfig('technicalDocKeywords', event.target.value)}
                />
              </label>
            </div>
            <p className="prompt-helper">仅写入提示词；执行时通过 dws 检索，不在本模块联网。</p>

            <label className="field">
              <span>测试说明（置于提示词头部）</span>
              <textarea
                rows={4}
                value={config.testNotes}
                placeholder="可粘贴测试目标、验收补充、接口/场景说明等；本模块不会主动联网。"
                onChange={(event) => updateConfig('testNotes', event.target.value)}
              />
            </label>
          </PromptSection>

          <PromptSection number="02" title="测试范围" description="默认功能 E2E；专项测试只有勾选后才执行。">
            <ChoiceGrid
              labels={scopeLabels}
              selected={config.scopes}
              onToggle={(value) => toggleListValue('scopes', value as TestScope)}
            />
            <div className="prompt-grid two compact-top">
              <SelectField
                label="API 主执行器"
                value={config.apiExecutor}
                options={{ ...apiExecutorLabels, auto: '自动：复杂 pytest，简单 Apifox' }}
                disabled={!config.scopes.includes('api')}
                onChange={(value) => updateConfig('apiExecutor', value as PromptWorkflowConfig['apiExecutor'])}
              />
              <div className="skill-route-summary">
                <Sparkles size={17} />
                <span>当前将路由 {generated.skillRoute.length} 个 QA Skills</span>
              </div>
            </div>
          </PromptSection>

          <PromptSection number="03" title="输入与动作" description="告诉工作流依据什么、需要做到哪一步。">
            <PromptSubheading>输入来源</PromptSubheading>
            <ChoiceGrid
              labels={inputSourceLabels}
              selected={config.inputSources}
              onToggle={(value) => toggleListValue('inputSources', value as InputSource)}
            />

            <PromptSubheading>前置数据与造数策略</PromptSubheading>
            <div className="prompt-grid three">
              <SelectField
                label="是否允许造数"
                value={config.dataCreation}
                options={{ controlled: '允许测试环境受控造数', forbidden: '不允许造数' }}
                onChange={(value) => updateConfig('dataCreation', value as PromptWorkflowConfig['dataCreation'])}
              />
              <SelectField
                label="造数后是否清理"
                value={config.dataCleanup}
                options={{ retain: '默认保留，不自动清理', cleanup: '测试后按 run_id 受控清理' }}
                disabled={config.dataCreation !== 'controlled'}
                onChange={(value) => updateConfig('dataCleanup', value as PromptWorkflowConfig['dataCleanup'])}
              />
              <SelectField
                label="是否补充造数说明"
                value={config.dataNotesMode}
                options={{ auto: '无需手动补充，自动分析', manual: '需要补充说明' }}
                onChange={(value) => updateConfig('dataNotesMode', value as PromptWorkflowConfig['dataNotesMode'])}
              />
            </div>
            {config.dataNotesMode === 'manual' && (
              <label className="field compact-top">
                <span>造数补充说明</span>
                <textarea
                  rows={3}
                  value={config.dataNotes}
                  placeholder="例如：优先复用有效订单；缺失时通过管理后台造数；数据保留供第二轮回归。"
                  onChange={(event) => updateConfig('dataNotes', event.target.value)}
                />
              </label>
            )}

            <PromptSubheading>任务动作</PromptSubheading>
            <ChoiceGrid
              labels={actionLabels}
              selected={config.actions}
              onToggle={(value) => toggleListValue('actions', value as WorkflowAction)}
            />
          </PromptSection>

          <PromptSection number="04" title="风险增强" description="按业务风险追加攻击性测试维度。">
            <ChoiceGrid
              labels={riskLabels}
              selected={config.risks}
              onToggle={(value) => toggleListValue('risks', value as RiskEnhancement)}
            />
          </PromptSection>

          <PromptSection number="05" title="权限边界" description="覆盖率是执行后的固定非阻断步骤。">
            <div className="permission-grid">
              <PermissionChoice label="允许真实执行测试" checked={config.permissions.executeTests} onChange={(checked) => updatePermission('executeTests', checked)} />
              <PermissionChoice label="允许线上写操作" checked={config.permissions.productionWrite} onChange={(checked) => updatePermission('productionWrite', checked)} />
              <PermissionChoice label="允许禅道写回" checked={config.permissions.zentaoWrite} onChange={(checked) => updatePermission('zentaoWrite', checked)} />
              <PermissionChoice label="允许修改 Apifox 资产" checked={config.permissions.apifoxModify} onChange={(checked) => updatePermission('apifoxModify', checked)} />
              <PermissionChoice label="允许沉淀长期资产" checked={config.permissions.retainAssets} onChange={(checked) => updatePermission('retainAssets', checked)} />
              <label className="permission-choice fixed">
                <input type="checkbox" checked disabled readOnly />
                <span>执行后主动提交覆盖率</span>
                <small>固定</small>
              </label>
            </div>
          </PromptSection>

          <div className="prompt-action-bar">
            <button className="button primary" onClick={() => setNotice('提示词已按当前配置生成')}>
              <Sparkles size={17} />
              生成提示词
            </button>
            <button className="button secondary" onClick={loadComplexExample}>
              <FilePlus2 size={17} />
              载入复杂二轮示例
            </button>
            <button className="button ghost" onClick={reset}>
              <RotateCcw size={17} />
              重置
            </button>
          </div>
        </section>

        <aside className="prompt-result-column">
          <div className="prompt-result-card">
            <div className="prompt-result-header">
              <div>
                <p className="eyebrow">GENERATED PROMPT</p>
                <h3>组装结果</h3>
              </div>
              <button className={`button ${copied ? 'success' : 'secondary'}`} onClick={() => void copyPrompt()}>
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
                {copied ? '已复制' : '复制提示词'}
              </button>
            </div>
            <div className="prompt-badges">
              {generated.badges.map((badge) => (
                <span key={badge}>{badge}</span>
              ))}
            </div>
            <pre className="prompt-output">{generated.prompt}</pre>
            <p className="prompt-local-note">
              当前功能不会发送网络请求。自定义模板与排序仅保存到本机应用数据中，规则计算在本地完成。
            </p>
          </div>
        </aside>
      </div>

      {templateDialogOpen && (
        <div className="dialog-backdrop" onMouseDown={() => setTemplateDialogOpen(false)}>
          <section className="template-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <h3>模板管理与排序</h3>
                <p>调整下拉顺序，或把当前配置保存为本地模板。</p>
              </div>
              <button className="icon-button" aria-label="关闭" onClick={() => setTemplateDialogOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="template-save-row">
              <label className="field">
                <span>新模板名称</span>
                <input
                  value={templateName}
                  placeholder="例如：会员中心发布前回归"
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </label>
              <button className="button primary" onClick={saveCurrentTemplate}>
                <Save size={16} />
                保存当前配置
              </button>
            </div>
            <div className="template-list">
              {orderedPresets.map((item, index) => {
                const isCustom = item.id.startsWith('custom-');
                return (
                  <div className="template-list-item" key={item.id}>
                    <GripVertical size={16} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{isCustom ? '本地模板' : '内置模板'}</span>
                    </div>
                    <button className="icon-button" disabled={index === 0} aria-label="上移" onClick={() => movePreset(item.id, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === orderedPresets.length - 1}
                      aria-label="下移"
                      onClick={() => movePreset(item.id, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      disabled={!isCustom}
                      aria-label="删除模板"
                      onClick={() => removeCustomTemplate(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="dialog-actions">
              <button className="button ghost" onClick={resetPresetOrder}>
                <RotateCcw size={16} />
                恢复默认排序
              </button>
              <button className="button secondary" onClick={() => setTemplateDialogOpen(false)}>
                完成
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PromptSection({
  number,
  title,
  description,
  children
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel prompt-section">
      <div className="prompt-section-header">
        <span>{number}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="prompt-section-body">{children}</div>
    </section>
  );
}

function PromptSubheading({ children }: { children: React.ReactNode }) {
  return <h4 className="prompt-subheading">{children}</h4>;
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(options).map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ChoiceGrid({
  labels,
  selected,
  onToggle
}: {
  labels: Record<string, string>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="choice-grid">
      {Object.entries(labels).map(([value, label]) => (
        <label className={`choice-chip ${selected.includes(value) ? 'selected' : ''}`} key={value}>
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function PermissionChoice({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`permission-choice ${checked ? 'selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function loadCustomPresets(): CustomWorkflowPreset[] {
  try {
    const raw = appStorage.getItem(CUSTOM_PRESETS_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function loadPresetOrder(): string[] {
  try {
    const raw = appStorage.getItem(PRESET_ORDER_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function orderPresets(presets: DisplayPreset[], order: string[]) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...presets].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return presets.indexOf(left) - presets.indexOf(right);
  });
}

function namesMatch(left: string, right: string) {
  return left.localeCompare(right, 'zh-CN', { sensitivity: 'base' }) === 0;
}
