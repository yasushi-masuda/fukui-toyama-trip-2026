#!/usr/bin/env node
/**
 * OrgOS hooks for Antigravity CLI
 *
 *   node .agents/scripts/orgos-hooks.js pretool   -> PreToolUse  (ポリシーゲート)
 *   node .agents/scripts/orgos-hooks.js stop      -> Stop        (autopilot 継続判定 + セッション記録)
 *
 * Claude Code 版 (.claude/hooks/pretool_policy.py / stop_gate.py / session_memory.py) の移植。
 * 入出力は Antigravity の hooks 仕様に合わせてある:
 *   - stdin  : JSON (camelCase)。conversationId / workspacePaths / transcriptPath / toolCall など
 *   - stdout : JSON。PreToolUse は decision 必須、Stop は decision に "continue" を返すとループ継続
 *
 * 挙動は .ai/CONTROL.yaml のフラグで制御する（Claude Code 版と同じキー）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ブロックしないときに返す判定。
//   'allow' … OrgOS のポリシーだけで通す（Claude Code 版と同じ挙動）
//   'ask'   … 毎回 Antigravity 側の確認プロンプトを出す（より厳しくしたい場合）
const PASS_THROUGH_DECISION = 'allow';

// ---------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------
function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function workspaceRoot(payload) {
  const ws = payload && payload.workspacePaths;
  if (Array.isArray(ws) && ws.length > 0) return ws[0];
  return process.cwd();
}

function readControl(root) {
  const p = path.join(root, '.ai', 'CONTROL.yaml');
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return '';
  }
}

// CONTROL.yaml のフラグを読む。
// 値の後ろに "# コメント" が続いていても読めるようにしてある
// （Claude Code 版の Python フックは行末コメントがあると読み落とす）。
function flag(control, key, def) {
  const m = new RegExp('^' + key + '\\s*:\\s*(true|false)\\s*(?:#.*)?$', 'mi').exec(control);
  if (!m) return def;
  return m[1].toLowerCase() === 'true';
}

function value(control, key, def) {
  const m = new RegExp('^' + key + '\\s*:\\s*"?([^\\n"#]+)"?\\s*(?:#.*)?$', 'm').exec(control);
  return m ? m[1].trim() : def;
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

// tool の引数からファイルパス / コマンド文字列を取り出す。
// Antigravity 側の引数キー名が将来変わっても拾えるよう、候補キー -> 全文走査の順で探す。
function pickString(args, keys) {
  if (!args || typeof args !== 'object') return '';
  for (const k of keys) {
    if (typeof args[k] === 'string' && args[k].trim()) return args[k];
  }
  for (const k of Object.keys(args)) {
    if (typeof args[k] === 'string' && args[k].trim()) return args[k];
  }
  return '';
}

// ---------------------------------------------------------------
// PreToolUse: OrgOS ポリシーゲート
// ---------------------------------------------------------------
const WRITE_TOOLS = ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'edit_file'];
const RUN_TOOLS = ['run_command', 'run_terminal_command', 'execute_command'];

function deny(reason) {
  out({ decision: 'deny', reason: 'OrgOS blocked: ' + reason });
}

function preTool(payload) {
  const root = workspaceRoot(payload);
  const control = readControl(root);
  const toolCall = payload.toolCall || {};
  const name = String(toolCall.name || '');
  const args = toolCall.args || {};

  const allowPush = flag(control, 'allow_push', false);
  const allowPushMain = flag(control, 'allow_push_main', false);
  const allowMainMutation = flag(control, 'allow_main_mutation', false);
  const allowDeploy = flag(control, 'allow_deploy', false);
  const allowDestructive = flag(control, 'allow_destructive_ops', false);
  const allowOsMutation = flag(control, 'allow_os_mutation', false);
  const mainBranch = value(control, 'main_branch', 'main');

  // ---- OS mutation guard: OrgOS 本体の書き換えは Owner 承認が要る ----
  if (WRITE_TOOLS.indexOf(name) >= 0) {
    let p = pickString(args, ['TargetFile', 'target_file', 'path', 'file_path', 'filePath', 'AbsolutePath', 'file']);
    p = p.replace(/\\/g, '/');
    const rel = p.startsWith(root.replace(/\\/g, '/')) ? p.slice(root.length + 1) : p;
    const isOsFile =
      rel === 'AGENTS.md' ||
      rel === 'GEMINI.md' ||
      rel.startsWith('.agents/') ||
      rel.startsWith('.ai/CONTROL.yaml');
    if (isOsFile && !allowOsMutation) {
      deny('OS mutation requires Owner approval (allow_os_mutation=true). Target=' + rel);
    }
  }

  // ---- コマンド実行以外はここで通す ----
  if (RUN_TOOLS.indexOf(name) < 0) {
    out({ decision: PASS_THROUGH_DECISION, reason: 'non-command tool allowed' });
  }

  const cmd = pickString(args, ['command', 'Command', 'CommandLine', 'cmd', 'script']).trim();
  if (!cmd) out({ decision: PASS_THROUGH_DECISION, reason: 'empty command' });

  // 危険なシステムコマンド
  if (/\b(sudo|mkfs|dd\s+if=|shutdown|reboot)\b/.test(cmd)) {
    deny('dangerous system command.');
  }

  // 破壊的削除
  if (/^\s*rm\s+-rf\b/.test(cmd) || /^\s*git\s+clean\s+-f/.test(cmd)) {
    if (/\brm\s+-rf\s+(\/tmp\/|\/var\/folders\/|\/private\/tmp\/)/.test(cmd)) {
      out({ decision: PASS_THROUGH_DECISION, reason: 'rm -rf allowed for temp directory' });
    }
    if (!allowDestructive) {
      deny('destructive ops disabled (allow_destructive_ops=false).');
    }
    out({ decision: PASS_THROUGH_DECISION, reason: 'destructive ops allowed by Owner flag' });
  }

  // git ガバナンス
  if (/^git\s/.test(cmd)) {
    if (/^git\s+push\b/.test(cmd)) {
      const toMain = new RegExp('\\b' + mainBranch + '\\b').test(cmd) || /\bHEAD:main\b/.test(cmd);
      if (toMain) {
        if (!allowPushMain) deny('push to ' + mainBranch + ' disabled (allow_push_main=false).');
      } else if (!allowPush) {
        deny('git push disabled (allow_push=false).');
      }
      out({ decision: PASS_THROUGH_DECISION, reason: 'git push allowed by Owner flag' });
    }
    if (/^git\s+(commit|merge|rebase|cherry-pick|reset|tag)\b/.test(cmd)) {
      if (!allowMainMutation && new RegExp('\\b' + mainBranch + '\\b').test(cmd)) {
        deny('main mutation disabled (allow_main_mutation=false).');
      }
    }
  }

  // デプロイガード
  if (/\b(kubectl|terraform|pulumi)\b/.test(cmd) || /\bdeploy\b/.test(cmd)) {
    if (!allowDeploy) {
      deny('deploy operations require Owner approval (allow_deploy=true).');
    }
  }

  out({ decision: PASS_THROUGH_DECISION, reason: 'allowed by OrgOS policy' });
}

// ---------------------------------------------------------------
// Stop: autopilot 継続判定 + セッションログ記録
// ---------------------------------------------------------------
function tasksRemaining(root) {
  try {
    const t = fs.readFileSync(path.join(root, '.ai', 'TASKS.yaml'), 'utf8');
    return /status:\s*(queued|running|blocked|review)\b/.test(t);
  } catch (e) {
    return false;
  }
}

function recordSession(root) {
  try {
    const dir = path.join(root, '.ai', 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    const file = path.join(dir, day + '.md');
    if (fs.existsSync(file)) {
      let c = fs.readFileSync(file, 'utf8');
      c = c.replace(/^End:.*$/m, 'End: ' + hm);
      fs.writeFileSync(file, c, 'utf8');
    } else {
      const tpl =
        '# Session Log: ' + day + '\n\n' +
        'Start: ' + hm + '\n' +
        'End: ' + hm + '\n\n' +
        '## Key Learnings\n\n' +
        '- (このセッションで分かった非自明なことを箇条書きで残す)\n\n' +
        '## Open Questions\n\n' +
        '- \n';
      fs.writeFileSync(file, tpl, 'utf8');
    }
  } catch (e) {
    /* 記録失敗は停止判定に影響させない */
  }
}

function stop(payload) {
  const root = workspaceRoot(payload);
  const control = readControl(root);

  recordSession(root);

  const autopilot = flag(control, 'autopilot', false);
  const paused = flag(control, 'paused', false);
  const awaitingOwner = flag(control, 'awaiting_owner', false);

  if (!autopilot || paused || awaitingOwner) {
    out({ decision: 'stop' });
  }
  if (!tasksRemaining(root)) {
    out({ decision: 'stop' });
  }
  out({
    decision: 'continue',
    reason:
      'OrgOS autopilot: .ai/TASKS.yaml に未完了タスク (queued/running/blocked/review) が残っている。' +
      '次のタスクを /org-tick の手順で進めること。止めたい場合は .ai/CONTROL.yaml の autopilot を false にする。',
  });
}

// ---------------------------------------------------------------
const mode = (process.argv[2] || '').toLowerCase();
const payload = readStdin();

if (mode === 'pretool') preTool(payload);
else if (mode === 'stop') stop(payload);
else out({});
