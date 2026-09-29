import { appStorage } from '../shared/appStorage';
import { Brain, ClipboardCopy, FileSymlink, FolderOpen, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AiClientId, LocalAssetScanResult, ReusableScene, SaveReusableSceneInput } from '../shared/types';
import { getErrorMessage, parseTags } from '../shared/uiUtils';

const PENDING_SCENE_CONTEXT_KEY = 'test-ai-assistant.pending-scene-context.v1';

interface SceneMemoryPanelProps {
  memoryScan: LocalAssetScanResult;
  memoryLoading: boolean;
  onRescanMemories: () => Promise<void>;
  onUseInPrompt: () => void;
  setNotice: (message: string) => void;
}

const emptyDraft: SaveReusableSceneInput = {
  title: '',
  clientId: 'codex',
  task: '',
  context: '',
  constraints: '',
  expectedOutput: '',
  tags: [],
  memories: []
};

export default function SceneMemoryPanel(props: SceneMemoryPanelProps) {
  const [scenes, setScenes] = useState<ReusableScene[]>([]);
  const [storePath, setStorePath] = useState('');
  const [draft, setDraft] = useState<SaveReusableSceneInput>(emptyDraft);
  const [tagDraft, setTagDraft] = useState('');
  const [selectedMemoryPaths, setSelectedMemoryPaths] = useState<Set<string>>(new Set());
  const [memoryQuery, setMemoryQuery] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refreshScenes(); }, []);

  const visibleMemories = useMemo(() => {
    const query = memoryQuery.trim().toLowerCase();
    return props.memoryScan.items.filter((memory) => !query || `${memory.name} ${memory.description} ${memory.sourceLabel} ${memory.relativePath}`.toLowerCase().includes(query));
  }, [memoryQuery, props.memoryScan.items]);

  async function refreshScenes() {
    try {
      const store = await getApi().listReusableScenes();
      setScenes(store.scenes);
      setStorePath(store.path);
    } catch (error) {
      props.setNotice(`加载复用场景失败：${getErrorMessage(error)}`);
    }
  }

  function updateDraft<K extends keyof SaveReusableSceneInput>(key: K, value: SaveReusableSceneInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setPreview('');
  }

  function toggleMemory(memoryPath: string) {
    setSelectedMemoryPaths((current) => {
      const next = new Set(current);
      if (next.has(memoryPath)) next.delete(memoryPath);
      else next.add(memoryPath);
      return next;
    });
    setPreview('');
  }

  function resetDraft() {
    setDraft(emptyDraft);
    setTagDraft('');
    setSelectedMemoryPaths(new Set());
    setPreview('');
  }

  async function saveScene() {
    if (!draft.title.trim() || !draft.task.trim()) {
      props.setNotice('请填写场景名称和本次任务');
      return;
    }
    setBusy(true);
    try {
      const saved = await getApi().saveReusableScene(toSaveInput());
      setDraft((current) => ({ ...current, id: saved.id }));
      await refreshScenes();
      props.setNotice(`场景已保存：${saved.title}`);
    } catch (error) {
      props.setNotice(`保存场景失败：${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function reuseScene(scene: ReusableScene) {
    setDraft({
      id: scene.id,
      title: scene.title,
      clientId: scene.clientId,
      task: scene.task,
      context: scene.context,
      constraints: scene.constraints,
      expectedOutput: scene.expectedOutput,
      tags: scene.tags,
      memories: scene.memories
    });
    setTagDraft(scene.tags.join('，'));
    setSelectedMemoryPaths(new Set(scene.memories.map((memory) => memory.path)));
    setPreview('');
    props.setNotice(`已复用场景：${scene.title}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteScene(scene: ReusableScene) {
    if (!window.confirm(`确定删除场景“${scene.title}”吗？`)) return;
    try {
      await getApi().deleteReusableScene(scene.id);
      if (draft.id === scene.id) resetDraft();
      await refreshScenes();
      props.setNotice(`已删除场景：${scene.title}`);
    } catch (error) {
      props.setNotice(`删除场景失败：${getErrorMessage(error)}`);
    }
  }

  async function buildContext() {
    const memories = props.memoryScan.items.filter((memory) => selectedMemoryPaths.has(memory.localPath));
    const memoryBlocks = await Promise.all(memories.map(async (memory) => {
      try {
        const content = await getApi().readLocalAsset(memory.localPath);
        return `### ${memory.name}\n来源：${memory.sourceLabel}\n路径：${memory.localPath}\n\n${truncate(content, 3500)}`;
      } catch (error) {
        return `### ${memory.name}\n读取失败：${getErrorMessage(error)}`;
      }
    }));
    const context = [
      '# 本次复用场景',
      `- 场景：${draft.title.trim() || '未命名场景'}`,
      `- AI 客户端：${clientLabel(draft.clientId)}`,
      tagDraft.trim() ? `- 标签：${parseTags(tagDraft).join('、')}` : '',
      '',
      '## 本次任务',
      draft.task.trim() || '未填写',
      draft.context?.trim() ? `\n## 已知上下文\n${draft.context.trim()}` : '',
      draft.constraints?.trim() ? `\n## 约束与注意事项\n${draft.constraints.trim()}` : '',
      draft.expectedOutput?.trim() ? `\n## 期望输出\n${draft.expectedOutput.trim()}` : '',
      memoryBlocks.length > 0 ? `\n## 复用的本地记忆\n${memoryBlocks.join('\n\n')}` : ''
    ].filter((line) => line !== '').join('\n');
    setPreview(context);
    return context;
  }

  async function copyContext() {
    setBusy(true);
    try {
      const context = await buildContext();
      await getApi().copyText(context);
      props.setNotice(`已复制场景上下文，复用 ${selectedMemoryPaths.size} 条记忆`);
    } finally {
      setBusy(false);
    }
  }

  async function useInPrompt() {
    setBusy(true);
    try {
      const context = await buildContext();
      appStorage.setItem(PENDING_SCENE_CONTEXT_KEY, context);
      props.onUseInPrompt();
    } finally {
      setBusy(false);
    }
  }

  function toSaveInput(): SaveReusableSceneInput {
    const scannedMemories = props.memoryScan.items
      .filter((memory) => selectedMemoryPaths.has(memory.localPath))
      .map((memory) => ({ name: memory.name, path: memory.localPath, sourceLabel: memory.sourceLabel }));
    const scannedPaths = new Set(scannedMemories.map((memory) => memory.path));
    const retainedMemories = (draft.memories ?? []).filter(
      (memory) => selectedMemoryPaths.has(memory.path) && !scannedPaths.has(memory.path)
    );
    return {
      ...draft,
      tags: parseTags(tagDraft),
      memories: [...scannedMemories, ...retainedMemories]
    };
  }

  async function revealMemory(memoryPath: string, memoryName: string) {
    try {
      await getApi().revealLocalAsset(memoryPath);
      props.setNotice(`已在资源管理器中定位：${memoryName}`);
    } catch (error) {
      props.setNotice(`打开记忆位置失败：${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="stack scene-memory-panel">
      <section className="panel scene-editor-panel">
        <div className="panel-header">
          <div><h3>本次场景</h3><p>保存当前任务上下文，并关联可复用的本地记忆。</p></div>
          <div className="inline-actions">
            <button className="button ghost" onClick={resetDraft}><RotateCcw size={15} />新场景</button>
            <button className="button primary" disabled={busy} onClick={() => void saveScene()}><Save size={15} />保存场景</button>
          </div>
        </div>
        <div className="scene-form-grid">
          <label className="field"><span>场景名称</span><input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="例如：会员续费第二轮回归" /></label>
          <label className="field"><span>AI 客户端</span><select value={draft.clientId} onChange={(event) => updateDraft('clientId', event.target.value as AiClientId)}><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="gemini">Gemini</option><option value="openclaw">OpenClaw</option><option value="other">其他客户端</option></select></label>
          <label className="field"><span>标签</span><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="回归，会员，第二轮" /></label>
        </div>
        <label className="field"><span>本次任务</span><textarea rows={4} value={draft.task} onChange={(event) => updateDraft('task', event.target.value)} placeholder="描述本次要完成的目标、范围和问题。" /></label>
        <div className="scene-form-grid three">
          <label className="field"><span>已知上下文</span><textarea rows={5} value={draft.context} onChange={(event) => updateDraft('context', event.target.value)} placeholder="仓库、分支、环境、需求背景……" /></label>
          <label className="field"><span>约束与注意事项</span><textarea rows={5} value={draft.constraints} onChange={(event) => updateDraft('constraints', event.target.value)} placeholder="不能做什么、必须遵循哪些规则……" /></label>
          <label className="field"><span>期望输出</span><textarea rows={5} value={draft.expectedOutput} onChange={(event) => updateDraft('expectedOutput', event.target.value)} placeholder="报告、代码、测试结果或其他交付物。" /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div><h3>选择复用记忆</h3><p>已选 {selectedMemoryPaths.size} / {props.memoryScan.items.length} 条；复制或发送时才读取内容。</p></div>
          <div className="inline-actions">
            <button className="button secondary" disabled={props.memoryLoading} onClick={() => void props.onRescanMemories()}>重新扫描记忆</button>
            <button className="button ghost" onClick={() => setSelectedMemoryPaths(new Set(visibleMemories.map((memory) => memory.localPath)))}>选择当前结果</button>
            <button className="button ghost" onClick={() => setSelectedMemoryPaths(new Set())}>清空</button>
          </div>
        </div>
        <label className="search-box scene-memory-search"><Search size={16} /><input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} placeholder="搜索记忆名称、描述、来源或路径" /></label>
        <div className="scene-memory-list">
          {visibleMemories.length === 0 ? <div className="empty-inline">暂无可复用记忆，请先扫描本地记忆。</div> : visibleMemories.map((memory) => (
            <article className={selectedMemoryPaths.has(memory.localPath) ? 'selected' : ''} key={memory.id}>
              <label><input type="checkbox" checked={selectedMemoryPaths.has(memory.localPath)} onChange={() => toggleMemory(memory.localPath)} /><Brain size={16} /><span><strong>{memory.name}</strong><small>{memory.sourceLabel} · {memory.relativePath}</small></span></label>
              <button className="icon-button" title="在资源管理器中打开记忆位置" onClick={() => void revealMemory(memory.localPath, memory.name)}><FolderOpen size={14} /></button>
            </article>
          ))}
        </div>
        <div className="scene-context-actions">
          <button className="button secondary" disabled={busy} onClick={() => void copyContext()}><ClipboardCopy size={15} />复制复用上下文</button>
          <button className="button primary" disabled={busy} onClick={() => void useInPrompt()}><FileSymlink size={15} />发送到提示词生成</button>
        </div>
        {preview && <pre className="scene-context-preview">{preview}</pre>}
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div><h3>已保存场景</h3><p>{scenes.length} 个可复用场景</p></div>
          <button className="button secondary" disabled={!storePath} onClick={() => void getApi().revealReusableSceneStore()}><FolderOpen size={15} />打开场景文件</button>
        </div>
        <div className="saved-scene-list">
          {scenes.length === 0 ? <div className="empty-inline">还没有保存场景。填写“本次场景”后即可沉淀复用。</div> : scenes.map((scene) => (
            <article key={scene.id}>
              <div><strong>{scene.title}</strong><span>{clientLabel(scene.clientId)} · {formatDate(scene.updatedAt)}</span><p>{scene.task}</p><small>{scene.memories.length} 条记忆 · {scene.tags.join('、') || '无标签'}</small></div>
              <div className="inline-actions"><button className="button small secondary" onClick={() => reuseScene(scene)}>复用</button><button className="icon-button danger" title="删除场景" onClick={() => void deleteScene(scene)}><Trash2 size={14} /></button></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function clientLabel(clientId: AiClientId) {
  if (clientId === 'codex') return 'Codex';
  if (clientId === 'claude') return 'Claude Code';
  if (clientId === 'gemini') return 'Gemini';
  if (clientId === 'openclaw') return 'OpenClaw';
  return '其他客户端';
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n……（记忆内容已截断）` : value;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function getApi() {
  if (!window.skillsManager) throw new Error('桌面能力不可用：请在 Electron 应用中使用完整功能');
  return window.skillsManager;
}
