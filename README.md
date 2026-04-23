# axure-html-mcp

> Axure HTML Export 기획서를 AI(gemini-cli / Claude Code)에서 직접 읽고 분석하는 커스텀 MCP 서버

![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![MCP](https://img.shields.io/badge/MCP-compatible-orange)

---

# Axure HTML Export MCP 가이드

> **버전**: v2.0  
> **대상**: Axure RP에서 HTML로 내보낸 기획서를 AI(gemini-cli / Claude Code)에서 직접 분석할 수 있게 해주는 커스텀 MCP 서버

---

## 개요

Axure Share는 로그인이 필요하고 공식 API가 없어 AI와 연동이 어렵습니다.  
이 MCP는 **Axure HTML Export** 파일을 파싱해서 AI가 기획서 내용을 직접 읽고 분석할 수 있게 합니다.

```
Axure RP → HTML Export → axure-mcp-server.mjs → AI (gemini / Claude Code)
```

---

## 사전 조건

### 1. Axure에서 HTML로 내보내기

Axure RP 메뉴: **Publish → Generate HTML Files**

내보낸 폴더 구조:
```
기획서명/
├── 표지.html
├── 메인.html
├── 결제.html
├── flow.html
├── index.html        ← 내부용 (MCP가 자동 제외)
├── start.html        ← 내부용 (MCP가 자동 제외)
└── ...
```

### 2. 의존성 설치

```bash
# 프로젝트 폴더 생성 및 패키지 설치
mkdir axure-mcp && cd axure-mcp
npm init -y
npm install cheerio @modelcontextprotocol/sdk
```

### 3. 필요 환경

- Node.js v18 이상
- gemini-cli 또는 Claude Code CLI

---

## 설치

### 서버 파일 배치

`axure-mcp-server.mjs` 파일을 원하는 경로에 저장합니다.

```
예시: D:\ai-agent\.gemini\axure-mcp-server.mjs
```

파일 상단의 경로 설정을 환경에 맞게 수정합니다:

```js
// axure-mcp-server.mjs 상단 설정값
const LOCAL      = '/your/path/axure-mcp/node_modules';  // cheerio 설치 경로
const DEFAULT_DIR = '/your/path/reports';                 // 기획서 기본 탐색 경로
```

### gemini-cli 등록

`~/.gemini/settings.json` (Windows: `C:\Users\{username}\.gemini\settings.json`):

```json
{
  "mcpServers": {
    "axure": {
      "command": "node",
      "args": ["D:\\ai-agent\\.gemini\\axure-mcp-server.mjs"]
    }
  }
}
```

### Claude Code 등록

`~/.claude.json` (WSL2/Linux: `~/.claude.json`):

```json
{
  "mcpServers": {
    "axure": {
      "command": "/usr/bin/node",
      "args": ["/home/username/.mcp/axure-mcp-server.mjs"]
    }
  }
}
```

---

## 도구 레퍼런스

### `scan_projects` — 기획서 탐색

지정한 폴더(및 하위 2단계)에서 Axure HTML export 폴더를 자동으로 찾아줍니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `base_dir` | string | ❌ | 탐색할 최상위 폴더 경로. 생략 시 `DEFAULT_DIR` 사용 |

**사용 예시**
```
"reports 폴더에 기획서가 몇 개야?"
"D:\projects 안에 있는 기획서 목록 보여줘"
```

**출력 예시**
```
Axure 기획서 2개 발견:

  1. 마켓플러스 유료 콘텐츠 기획안 (22페이지) ← 현재 활성
     경로: D:\reports\마켓플러스 유료콘텐츠 기획안

  2. 신규 서비스 기획안 (15페이지)
     경로: D:\reports\신규 서비스 기획안
```

---

### `list_pages` — 페이지 목록 조회

기획서의 전체 페이지 목록과 화면 ID를 반환합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `export_dir` | string | ❌ | 기획서 폴더 경로. 생략 시 마지막 사용 경로 자동 적용 |

**사용 예시**
```
"이 기획서 페이지 목록 보여줘"
"D:\reports\새기획서 폴더의 페이지 목록 알려줘"
```

**출력 예시**
```
📁 마켓플러스 유료콘텐츠 기획안
총 22개 페이지:

  [PRJ-0000]       표지
  [PRJ-0000_01]    메인
  [PRJ-0000_01]    콘텐츠 메뉴
  [PRJ-0000_02]    상품상세
  [PRJ-0000_02]    결제전
  ...
```

---

### `get_page` — 페이지 상세 내용

특정 페이지의 기획 텍스트와 위젯 주석을 추출합니다.  
숨겨진 요소(`display:none`)는 자동으로 제외됩니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `page_name` | string | ✅ | 페이지명 (부분 일치 허용) |
| `export_dir` | string | ❌ | 기획서 폴더 경로 |

**사용 예시**
```
"결제 페이지 기획 내용 보여줘"
"정보입력 화면 설명해줘"
"메인 페이지 분석해줘"
```

**출력 예시**
```
═══ 결제전 [PRJ-0000_02] ═══

▶ 기획 내용
   1. PRJ-0000_02
   2. 결제전
   3. 상품명
   4. 포인트 잔액
   5. 결제 수단 선택
   ...

▶ 위젯 주석
  • 결제 버튼 클릭 시 결제 프로세스 진행
```

---

### `search` — 전체 검색

키워드가 포함된 페이지와 문맥을 찾습니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `keyword` | string | ✅ | 검색할 키워드 |
| `export_dir` | string | ❌ | 기획서 폴더 경로 |

**사용 예시**
```
"포인트 관련 화면 전부 찾아줘"
"결제 실패 케이스가 어느 페이지에 있어?"
"로그인 언급된 페이지 있어?"
```

**출력 예시**
```
"포인트" — 4개 페이지에서 발견

▶ 결제전 [PRJ-0000_02]
   ...포인트 잔액을 확인하고...
   ...포인트 부족 시 안내 팝업...

▶ 마이메뉴 [PRJ-0000_02]
   ...보유 포인트...
```

---

### `get_summary` — 기획서 요약

기획서 전체를 카테고리별로 자동 분류하여 요약합니다.  
표지 페이지에서 프로젝트명·배포일·작성자를 자동으로 추출합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `export_dir` | string | ❌ | 기획서 폴더 경로 |

**사용 예시**
```
"이 기획서 전체 요약해줘"
"D:\reports\신규기획안 요약해줘"
```

**출력 예시**
```
══════════════════════════════════════════
  📋 마켓플러스 유료 콘텐츠 기획안_v0.1
══════════════════════════════════════════
  배포: 25년 9월
  작성: PM/기획 이기획
  총 페이지: 22개

📂 기획 문서
   • 표지 [PRJ-0000]
   • 히스토리
   • 개요안
   • 작업내용
   • FLOW

🎯 콘텐츠 화면
   • 메인 [PRJ-0000_01]
   • 콘텐츠 메뉴 [PRJ-0000_01]
   • 상품A [PRJ-0000_02]
   • 상품B [PRJ-0000_02]
   ...

💳 구매·결제 흐름
   • 정보입력 [PRJ-0000_02]
   • 결제전 [PRJ-0000_02]
   • 결제 [PRJ-0000_02]
   • 결제후 결과 [PRJ-0000_02]

👤 마이페이지
   • 마이메뉴 [PRJ-0000_02]
   • 구매한 콘텐츠 [PRJ-0000_02]
```

---

### `get_flow` — 화면 흐름 구조

`flow.html` 페이지에서 화면 간 연결 구조를 추출합니다.  
Axure에서 Flow 다이어그램을 그렸을 때만 유효합니다.

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `export_dir` | string | ❌ | 기획서 폴더 경로 |

---

## 경로 자동 기억 기능

`export_dir`를 한 번 지정하면 `axure-last-used.json`에 저장되어 다음 호출부터 생략할 수 있습니다.

```
# 처음: 경로 지정
"D:\reports\새기획서 분석해줘"
→ get_summary(export_dir: "D:\reports\새기획서")
→ 경로 저장됨

# 이후: 경로 생략 가능
"결제 페이지 보여줘"
→ get_page("결제")  ← 저장된 경로 자동 사용
```

경로 우선순위:
```
호출 시 export_dir 지정 > axure-last-used.json > DEFAULT_DIR(기본값)
```

---

## 활용 예시

### 기획서 온보딩
```
1. "기획서 목록 보여줘"                    → scan_projects
2. "전체 구조 요약해줘"                    → get_summary
3. "결제 플로우 화면들 설명해줘"            → get_page (각 화면)
```

### 기획 검토
```
"에러 처리 케이스가 몇 개 페이지에 있어?"    → search "에러"
"취소 버튼이 어느 화면에 있어?"             → search "취소"
"PRJ-0000_02 화면들 목록 알려줘"           → search "PRJ-0000_02"
```

### 타 MCP와 연계
```
"기획서의 결제 플로우를 분석해서 Jira 이슈로 만들어줘"
→ get_page("결제전") + get_page("결제") → jira MCP로 이슈 생성

"이 기획서 요약을 Google Docs에 저장해줘"
→ get_summary() → google-drive MCP로 문서 생성

"기획 검토 완료됐다고 Slack에 알려줘"
→ slack MCP로 메시지 전송
```

---

## 제약 사항

| 항목 | 내용 |
|------|------|
| 지원 포맷 | Axure HTML Export만 가능 (`.rp` 바이너리 파일 직접 파싱 불가) |
| Axure 버전 | RP 8 / 9 / 10 HTML Export 모두 지원 |
| 이미지 | 이미지 내 텍스트는 읽지 못함 (Axure 텍스트 위젯만 추출) |
| 인터랙션 | 버튼 클릭 동작·조건식 등 인터랙션 로직은 추출하지 않음 |

---

## WSL2 / Linux 환경 적용

`axure-mcp-server.mjs` 상단의 경로를 Linux 형식으로 변경합니다.

```js
// Windows
const LOCAL      = 'D:/ai-agent/.gemini/axure-mcp/node_modules';
const DEFAULT_DIR = 'D:/ai-agent/agent-team/reports';

// WSL2 / Linux (npm root -g 결과로 교체)
const LOCAL      = '/usr/lib/node_modules';
const DEFAULT_DIR = '/home/username/reports';
```

`~/.claude.json` 설정:
```json
{
  "mcpServers": {
    "axure": {
      "command": "/usr/bin/node",
      "args": ["/home/username/.mcp/axure-mcp-server.mjs"]
    }
  }
}
```

---

## 파일 구조

```
axure-mcp/
├── axure-mcp-server.mjs      ← MCP 서버 본체
├── axure-last-used.json      ← 마지막 사용 경로 자동 저장 (gitignore 권장)
└── node_modules/
    └── cheerio/              ← HTML 파서
```
