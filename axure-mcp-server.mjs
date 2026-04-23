/**
 * Axure HTML Export MCP Server (동적 경로 지원)
 *
 * 모든 도구가 export_dir 파라미터를 선택적으로 받습니다.
 * 생략 시 마지막으로 사용한 경로(last-used.json) 또는 기본 경로를 사용합니다.
 *
 * Tools:
 *   scan_projects  - 지정 디렉터리에서 Axure HTML export 폴더 탐색
 *   list_pages     - 전체 페이지 목록
 *   get_page       - 특정 페이지 기획 내용 추출
 *   search         - 키워드로 전체 기획서 검색
 *   get_summary    - 전체 기획 요약
 *   get_flow       - 화면 흐름 구조
 */

import fs   from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const toURL     = p => pathToFileURL(p).href;
const NM        = path.join(__dirname, 'node_modules');

const { Server }               = await import(toURL(`${NM}/@modelcontextprotocol/sdk/dist/server/index.js`));
const { StdioServerTransport } = await import(toURL(`${NM}/@modelcontextprotocol/sdk/dist/server/stdio.js`));
const { CallToolRequestSchema, ListToolsRequestSchema }
  = await import(toURL(`${NM}/@modelcontextprotocol/sdk/dist/types.js`));

const { load: cheerioLoad } = require(`${NM}/cheerio`);

// ── 경로 관리 ─────────────────────────────────────────────────────────────────
const LAST_USED_PATH = path.join(__dirname, 'axure-last-used.json');
const DEFAULT_DIR    = process.env.AXURE_DEFAULT_DIR || path.join(__dirname, 'examples');
const SKIP_FILES     = new Set(['index.html', 'start.html', 'start_c_1.html', 'start_with_pages.html']);

/** 마지막 사용 경로 저장 */
function saveLastUsed(dir) {
  try { fs.writeFileSync(LAST_USED_PATH, JSON.stringify({ dir, updatedAt: new Date().toISOString() })); }
  catch(e) {}
}

/** 마지막 사용 경로 로드 */
function loadLastUsed() {
  try {
    const data = JSON.parse(fs.readFileSync(LAST_USED_PATH, 'utf-8'));
    if (fs.existsSync(data.dir)) return data.dir;
  } catch(e) {}
  return null;
}

/** export_dir 결정: 인자 → 마지막 사용 경로 → 기본 경로 */
function resolveDir(exportDir) {
  if (exportDir && fs.existsSync(exportDir)) {
    saveLastUsed(exportDir);
    return exportDir;
  }
  const last = loadLastUsed();
  if (last) return last;
  return DEFAULT_DIR;
}

/** Axure HTML export 폴더 여부 판별 (HTML 파일이 3개 이상이면 간주) */
function isAxureExport(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);
    const htmlCount = files.filter(f => f.endsWith('.html')).length;
    return htmlCount >= 3;
  } catch(e) { return false; }
}

// ── HTML 파싱 ─────────────────────────────────────────────────────────────────
function parsePageHtml(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const $    = cheerioLoad(html);
  const title = $('title').text().trim();

  let screenId = '';
  const texts  = [];

  $('[id$="_text"]').each((_, el) => {
    const $el  = $(el);
    const style = ($el.attr('style') || '') + ($el.parents('[style]').attr('style') || '');
    if (style.includes('display:none') || style.includes('visibility: hidden')) return;
    const txt = $el.text().trim();
    if (!txt) return;
    const m = txt.match(/SRI-\d{4}[_\d]*/);
    if (m && !screenId) screenId = m[0];
    texts.push(txt);
  });

  const uniqueTexts = [...new Set(texts)];

  // 위젯 주석 수집 (이름 있는 것만)
  const comments = [];
  const re = /<!--\s*([^-]{2,80}?)\s*-->/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const c = m[1].trim();
    if (c && !c.startsWith('Unnamed') && !c.startsWith('u') && c.length < 80) {
      comments.push(c);
    }
  }

  return { title, screenId, texts: uniqueTexts, comments: [...new Set(comments)] };
}

function loadAllPages(exportDir) {
  const files = fs.readdirSync(exportDir)
    .filter(f => f.endsWith('.html') && !SKIP_FILES.has(f))
    .sort();

  return files.map(filename => {
    try {
      const { title, screenId, texts } = parsePageHtml(path.join(exportDir, filename));
      return { filename, title, screenId, textCount: texts.length };
    } catch(e) {
      return { filename, title: filename.replace('.html', ''), screenId: '', textCount: 0 };
    }
  });
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
const ok  = text => ({ content: [{ type: 'text', text: String(text) }], isError: false });
const err = text => ({ content: [{ type: 'text', text: String(text) }], isError: true  });

const DIR_PARAM = {
  export_dir: {
    type: 'string',
    description: 'Axure HTML export 폴더 경로 (생략 시 마지막 사용 경로 자동 사용)',
  },
};

// ── MCP 서버 ──────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'axure-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scan_projects',
      description: '지정 디렉터리(또는 기본 경로)에서 Axure HTML export 폴더 목록 탐색. 어떤 기획서가 있는지 파악할 때 사용',
      inputSchema: {
        type: 'object',
        properties: {
          base_dir: {
            type: 'string',
            description: `탐색할 최상위 폴더 경로 (생략 시 기본값: ${DEFAULT_DIR})`,
          },
        },
      },
    },
    {
      name: 'list_pages',
      description: 'Axure 기획서의 전체 페이지 목록과 화면 ID 반환',
      inputSchema: { type: 'object', properties: { ...DIR_PARAM } },
    },
    {
      name: 'get_page',
      description: '특정 페이지의 기획 내용(텍스트, 설명) 추출',
      inputSchema: {
        type: 'object',
        required: ['page_name'],
        properties: {
          page_name: {
            type: 'string',
            description: '페이지명 (예: 메인, 결제, 정보입력). list_pages로 확인 가능',
          },
          ...DIR_PARAM,
        },
      },
    },
    {
      name: 'search',
      description: '키워드로 기획서 전체 페이지를 검색',
      inputSchema: {
        type: 'object',
        required: ['keyword'],
        properties: {
          keyword: { type: 'string', description: '검색할 키워드' },
          ...DIR_PARAM,
        },
      },
    },
    {
      name: 'get_summary',
      description: '기획서 전체 요약 — 페이지 구성·주요 흐름 정리',
      inputSchema: { type: 'object', properties: { ...DIR_PARAM } },
    },
    {
      name: 'get_flow',
      description: '화면 흐름(flow.html) 페이지 내용 추출 — 페이지 간 연결 구조 파악',
      inputSchema: { type: 'object', properties: { ...DIR_PARAM } },
    },
  ],
}));

// ── 툴 실행 ───────────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {

    // ── scan_projects ────────────────────────────────────────────────────────
    if (name === 'scan_projects') {
      const baseDir = args?.base_dir || DEFAULT_DIR;

      if (!fs.existsSync(baseDir)) {
        return err(`경로가 존재하지 않습니다: ${baseDir}`);
      }

      // 재귀 탐색 (최대 2단계)
      const found = [];

      function scanDir(dir, depth) {
        if (depth > 2) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return; }

        if (isAxureExport(dir)) {
          const htmlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.html') && !SKIP_FILES.has(e.name));
          const pageCount = htmlFiles.length;
          // 프로젝트명 추론 (표지.html에서)
          let projectName = path.basename(dir);
          const coverPath = path.join(dir, '표지.html');
          if (fs.existsSync(coverPath)) {
            try {
              const { texts } = parsePageHtml(coverPath);
              const titleText = texts.find(t => t.length > 4 && t.length < 50 && !t.match(/^[\d\s]+$/));
              if (titleText) projectName = titleText;
            } catch(e) {}
          }
          found.push({ dir, projectName, pageCount });
          return; // 하위 탐색 불필요
        }

        entries.filter(e => e.isDirectory()).forEach(e => {
          scanDir(path.join(dir, e.name), depth + 1);
        });
      }

      scanDir(baseDir, 0);

      if (found.length === 0) {
        return ok(`Axure HTML export 폴더를 찾지 못했습니다.\n탐색 경로: ${baseDir}\n\nAxure에서 Publish → Generate HTML Files로 내보낸 후 다시 시도하세요.`);
      }

      const last = loadLastUsed();
      const lines = found.map((f, i) => {
        const active = f.dir === last ? ' ← 현재 활성' : '';
        return `  ${i + 1}. ${f.projectName} (${f.pageCount}페이지)${active}\n     경로: ${f.dir}`;
      });

      return ok(`Axure 기획서 ${found.length}개 발견:\n\n${lines.join('\n\n')}\n\n💡 분석하려면: "get_summary export_dir: [경로]" 또는 경로를 말씀해주세요.`);
    }

    // ── list_pages ───────────────────────────────────────────────────────────
    if (name === 'list_pages') {
      const dir   = resolveDir(args?.export_dir);
      const pages = loadAllPages(dir);
      const projectName = path.basename(dir);

      const lines = pages.map(p => {
        const id = p.screenId ? `[${p.screenId}]` : '';
        return `  ${id.padEnd(16)} ${p.title}`;
      });

      return ok(`📁 ${projectName}\n총 ${pages.length}개 페이지:\n\n${lines.join('\n')}\n\n경로: ${dir}`);
    }

    // ── get_page ─────────────────────────────────────────────────────────────
    if (name === 'get_page') {
      const dir   = resolveDir(args?.export_dir);
      const query = (args?.page_name ?? '').toLowerCase();
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !SKIP_FILES.has(f));

      const matched = files.find(f =>
        f.replace('.html', '').toLowerCase().includes(query) ||
        f.toLowerCase().replace('.html', '') === query
      );

      if (!matched) {
        const names = files.map(f => f.replace('.html', '')).join(', ');
        return err(`페이지를 찾을 수 없습니다: "${args?.page_name}"\n사용 가능: ${names}`);
      }

      const { title, screenId, texts, comments } = parsePageHtml(path.join(dir, matched));

      const out = [
        `═══ ${title} ${screenId ? `[${screenId}]` : ''} ═══`,
        `경로: ${dir}`,
        '',
        '▶ 기획 내용',
        ...texts.map((t, i) => `  ${String(i + 1).padStart(2)}. ${t}`),
      ];

      if (comments.length > 0) {
        out.push('', '▶ 위젯 주석');
        comments.forEach(c => out.push(`  • ${c}`));
      }

      return ok(out.join('\n'));
    }

    // ── search ───────────────────────────────────────────────────────────────
    if (name === 'search') {
      const dir     = resolveDir(args?.export_dir);
      const keyword = (args?.keyword ?? '').toLowerCase();
      const files   = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !SKIP_FILES.has(f));

      const results = [];
      for (const filename of files) {
        const { title, screenId, texts } = parsePageHtml(path.join(dir, filename));
        const hits = texts.filter(t => t.toLowerCase().includes(keyword));
        if (hits.length > 0) {
          results.push({ page: title, screenId, hits: hits.map(t => {
            const idx = t.toLowerCase().indexOf(keyword);
            const s   = Math.max(0, idx - 25);
            const e   = Math.min(t.length, idx + keyword.length + 25);
            return `...${t.substring(s, e)}...`;
          })});
        }
      }

      if (results.length === 0) return ok(`"${args?.keyword}" 검색 결과 없음\n경로: ${dir}`);

      const out = [`"${args?.keyword}" — ${results.length}개 페이지에서 발견\n`];
      results.forEach(r => {
        out.push(`▶ ${r.page} ${r.screenId ? `[${r.screenId}]` : ''}`);
        r.hits.forEach(h => out.push(`   ${h}`));
        out.push('');
      });

      return ok(out.join('\n'));
    }

    // ── get_summary ──────────────────────────────────────────────────────────
    if (name === 'get_summary') {
      const dir   = resolveDir(args?.export_dir);
      const pages = loadAllPages(dir);

      // 표지에서 프로젝트 정보 추출
      let projectTitle = path.basename(dir);
      let releaseDate  = '';
      let author       = '';
      const coverPath  = path.join(dir, '표지.html');
      if (fs.existsSync(coverPath)) {
        const { texts } = parsePageHtml(coverPath);
        const titleText = texts.find(t => t.length > 4 && t.length < 60 && !t.match(/^[\d\s.]+$/) && !t.match(/^SRI/));
        if (titleText) projectTitle = titleText;
        const dateText = texts.find(t => /\d{2}년/.test(t) || /20\d{2}/.test(t));
        if (dateText) releaseDate = dateText;
        const authorText = texts.find(t => t.includes('PM') || t.includes('기획') || t.includes('노'));
        if (authorText) author = authorText;
      }

      // 페이지를 성격별로 자동 분류
      const docPages     = pages.filter(p => ['표지','히스토리','개요안','작업내용','flow','FLOW'].some(k => p.title.includes(k)));
      const contentPages = pages.filter(p => !docPages.includes(p) && !['결제','마이','구매','정보입력'].some(k => p.title.includes(k)));
      const payPages     = pages.filter(p => ['결제','정보입력'].some(k => p.title.includes(k)));
      const myPages      = pages.filter(p => ['마이','구매'].some(k => p.title.includes(k)));

      const out = [
        '══════════════════════════════════════════',
        `  📋 ${projectTitle}`,
        '══════════════════════════════════════════',
        releaseDate ? `  배포: ${releaseDate}` : '',
        author      ? `  작성: ${author}` : '',
        `  경로: ${dir}`,
        `  총 페이지: ${pages.length}개`,
        '',
        '📂 기획 문서',
        ...docPages.map(p => `   • ${p.title} ${p.screenId ? `[${p.screenId}]` : ''}`),
        '',
        '🎯 콘텐츠 화면',
        ...contentPages.map(p => `   • ${p.title} ${p.screenId ? `[${p.screenId}]` : ''}`),
        '',
        '💳 구매·결제 흐름',
        ...payPages.map(p => `   • ${p.title} ${p.screenId ? `[${p.screenId}]` : ''}`),
        '',
        '👤 마이페이지',
        ...myPages.map(p => `   • ${p.title} ${p.screenId ? `[${p.screenId}]` : ''}`),
        '',
        '💡 더 보려면:',
        '   get_page "페이지명"    — 특정 페이지 상세 내용',
        '   search "키워드"        — 전체 기획서 검색',
        '   get_flow               — 화면 흐름 구조',
      ].filter(l => l !== undefined);

      return ok(out.join('\n'));
    }

    // ── get_flow ─────────────────────────────────────────────────────────────
    if (name === 'get_flow') {
      const dir      = resolveDir(args?.export_dir);
      const flowPath = path.join(dir, 'flow.html');
      if (!fs.existsSync(flowPath)) {
        return err(`flow.html 이 없습니다.\n경로: ${dir}`);
      }
      const { texts } = parsePageHtml(flowPath);
      const out = [
        '══ 화면 흐름 (Flow) ══',
        `경로: ${dir}`,
        '',
        ...texts.map(t => `  ${t}`),
      ];
      return ok(out.join('\n'));
    }

    return err(`Unknown tool: ${name}`);

  } catch(e) {
    return err(`오류: ${e.message}`);
  }
});

// ── 시작 ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

const last = loadLastUsed();
process.stderr.write(`[axure-mcp] v2.0 started. 기본경로: ${DEFAULT_DIR}${last ? ` | 마지막 사용: ${last}` : ''}\n`);
