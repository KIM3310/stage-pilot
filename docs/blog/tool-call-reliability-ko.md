# LLM Tool Calling, 성공률 25%에서 90%로 끌어올리기: stage-pilot 개발기

> LLM이 도구를 제대로 호출하지 못하는 문제를 파서 미들웨어와 재시도 루프로 해결한 과정을 공유합니다.

---

## 들어가며

LLM 기반 에이전트를 프로덕션에 배포해본 분이라면, 한번쯤 이런 경험이 있을 겁니다. 분명 프롬프트에 JSON 스키마를 명시했는데, 모델이 XML을 뱉어낸다거나. 존재하지 않는 도구 이름을 만들어낸다거나. 필수 인자를 통째로 빼먹는다거나.

**Tool calling의 신뢰성 문제**는 LLM 에이전트 시스템의 가장 근본적인 병목입니다.

GPT-4o나 Claude처럼 네이티브 tool-calling을 지원하는 모델은 비교적 안정적이지만, 오픈소스 모델이나 경량 모델을 사용하면 상황이 달라집니다. 우리 벤치마크 기준으로, 아무런 보정 없이 도구 호출을 시도하면 **성공률이 25%**에 불과했습니다.

이 글에서는 `stage-pilot` 프로젝트와 npm 패키지 `@ai-sdk-tool/parser`를 통해 이 성공률을 **90%까지 끌어올린 과정**을 기술적으로 풀어보겠습니다.

---

## 1. 문제 정의: 왜 Tool Calling이 깨지는가

### 포맷 드리프트

동일한 모델에 동일한 프롬프트를 보내도, 응답 포맷이 턴마다 달라지는 현상이 발생합니다.

```
// 첫 번째 턴
{"tool": "search", "args": {"query": "weather"}}

// 두 번째 턴 (같은 모델, 같은 프롬프트)
<tool_call>
  <name>search</name>
  <arguments><query>weather</query></arguments>
</tool_call>
```

JSON을 요청했는데 XML이 오고, XML을 요청했는데 마크다운 코드블록에 감싸서 오고. 이런 **포맷 드리프트**는 파이프라인 전체를 멈추게 합니다.

### 흔히 발생하는 실패 패턴

| 실패 유형 | 예시 | 발생 빈도 |
|-----------|------|----------|
| 도구 이름 환각 | `searchWeb` 대신 `web_search` 생성 | 높음 |
| 필수 인자 누락 | `query` 파라미터 없이 호출 | 높음 |
| 타입 불일치 | 숫자를 기대하는 곳에 문자열 전달 | 중간 |
| 중첩 구조 오류 | 배열이어야 할 곳에 단일 객체 | 중간 |
| 포맷 혼합 | JSON 안에 XML 태그 포함 | 낮음 |

### 기존 해결 방법의 한계

대부분의 프로젝트에서는 정규표현식으로 출력을 파싱합니다.

```typescript
// 전형적인 regex 핵
const match = output.match(/```json\n([\s\S]*?)\n```/);
const toolCall = JSON.parse(match[1]);
```

이 방식은 모델이 **예상한 포맷을 정확히 따를 때만** 동작합니다. 포맷이 조금만 바뀌면 즉시 깨집니다. 프로덕션 환경에서는 신뢰할 수 없는 접근법입니다.

---

## 2. 접근 방식: Stage-Gated Pipeline

`stage-pilot`은 5개의 스테이지로 구성된 게이트 파이프라인입니다. 각 스테이지는 독립적인 에이전트가 담당하며, 통과/실패 게이트와 텔레메트리를 갖습니다.

```
[Eligibility] → [Safety] → [Planner] → [Outreach] → [Judge]
     ↓              ↓           ↓            ↓           ↓
   Pass/Fail    Pass/Fail   Pass/Fail    Pass/Fail   Pass/Fail
```

### 각 스테이지의 역할

1. **Eligibility**: 입력이 파이프라인 처리 대상인지 판별
2. **Safety**: 콘텐츠 안전성 검증 및 유해 입력 필터링
3. **Planner**: 실행 계획 수립 및 도구 호출 시퀀스 결정
4. **Outreach**: 외부 API/도구 실제 호출 수행
5. **Judge**: 최종 결과 품질 평가 및 승인/재시도 결정

### 파서 미들웨어

핵심은 각 스테이지에서 모델 출력을 가로채는 **파서 미들웨어**입니다.

```typescript
import { createParserMiddleware } from '@ai-sdk-tool/parser';

const middleware = createParserMiddleware({
  // 1단계: 포맷 정규화 (JSON/XML 자동 감지 및 수정)
  formatNormalization: true,
  // 2단계: 스키마 강제 변환 (타입 불일치 자동 수정)
  schemaCoercion: true,
  // 3단계: 도구 이름 퍼지 매칭
  fuzzyToolMatch: true,
});
```

### RALPH 재시도 루프

파서가 복구할 수 없는 출력이 나올 경우, **RALPH**(Retry with Augmented LLM Prompt Hinting) 루프가 작동합니다.

```typescript
const ralph = createRetryLoop({
  maxRetries: 3,
  strategy: 'augmented-hint',
  onRetry: (attempt, error) => {
    // 이전 실패 원인을 프롬프트에 힌트로 추가
    return {
      hint: `Previous attempt failed: ${error.message}. 
             Please output valid JSON matching the schema.`
    };
  }
});
```

RALPH는 단순 재시도가 아닙니다. 이전 실패 원인을 분석해 프롬프트에 힌트를 추가하는 **증강 재시도** 전략입니다.

---

## 3. 벤치마크: 정량적 검증

### 실험 설계

신뢰할 수 있는 벤치마크를 위해 다음 원칙을 적용했습니다.

- **40개 결정론적 테스트 케이스**: 시드 기반 랜덤으로 재현 가능
- **20가지 변이 모드**: 실제 환경에서 발생하는 실패를 시뮬레이션
- **3가지 전략 비교**: baseline, middleware, middleware+retry

### 20가지 변이 모드

| # | 변이 모드 | 설명 |
|---|----------|------|
| 1 | `json_to_xml` | JSON 요청에 XML 응답 반환 |
| 2 | `xml_to_json` | XML 요청에 JSON 응답 반환 |
| 3 | `missing_required_arg` | 필수 인자 랜덤 제거 |
| 4 | `extra_args` | 스키마에 없는 추가 인자 삽입 |
| 5 | `tool_name_hallucination` | 존재하지 않는 도구 이름 생성 |
| 6 | `type_mismatch_string` | 숫자 필드에 문자열 값 전달 |
| 7 | `type_mismatch_number` | 문자열 필드에 숫자 값 전달 |
| 8 | `nested_object_flatten` | 중첩 객체를 평탄화하여 반환 |
| 9 | `array_to_single` | 배열 필드에 단일 값 반환 |
| 10 | `single_to_array` | 단일 값 필드에 배열 반환 |
| 11 | `markdown_wrapping` | 응답을 마크다운 코드블록으로 감싸기 |
| 12 | `partial_json` | 잘린 JSON (닫는 괄호 누락) |
| 13 | `trailing_text` | JSON 뒤에 자연어 설명 추가 |
| 14 | `leading_text` | JSON 앞에 자연어 설명 추가 |
| 15 | `duplicate_keys` | JSON에 중복 키 존재 |
| 16 | `unquoted_keys` | JSON 키에 따옴표 누락 |
| 17 | `single_quotes` | 쌍따옴표 대신 홑따옴표 사용 |
| 18 | `boolean_as_string` | `true`/`false` 대신 `"true"`/`"false"` |
| 19 | `null_for_required` | 필수 필드에 `null` 값 |
| 20 | `empty_response` | 완전히 빈 응답 반환 |

### 결과

| 전략 | 성공 케이스 | 성공률 | 개선폭 |
|------|-----------|--------|--------|
| Baseline (파싱 없음) | 10/40 | **25%** | - |
| Middleware Only | 26/40 | **65%** | +40%p |
| Middleware + RALPH | 36/40 | **90%** | +65%p |

```
성공률 비교
Baseline        ████████░░░░░░░░░░░░░░░░░░░░░░░░  25%
Middleware      ████████████████████░░░░░░░░░░░░░  65%
MW + RALPH      ████████████████████████████░░░░░  90%
```

### 실패 분석

나머지 10% (4개 케이스)의 실패 원인은 다음과 같습니다.

- **도구 이름 환각 (2건)**: 모델이 완전히 새로운 도구 이름을 창작하여 퍼지 매칭으로도 복구 불가
- **빈 응답 (1건)**: 모델이 도구 호출 자체를 거부
- **복합 실패 (1건)**: 타입 불일치 + 인자 누락이 동시 발생

이 실패들은 파서 레벨에서 해결할 수 없으며, **모델 자체의 개선**(LoRA 파인튜닝)이 필요합니다.

---

## 4. 핵심 기술 결정

### AI SDK 미들웨어 패턴

`@ai-sdk-tool/parser`는 Vercel AI SDK의 미들웨어 패턴을 채택했습니다. 이를 통해 프로바이더에 독립적인 통합이 가능합니다.

```typescript
import { generateText } from 'ai';
import { createParserMiddleware } from '@ai-sdk-tool/parser';

const result = await generateText({
  model: yourModel,
  tools: yourTools,
  // 미들웨어를 끼워넣기만 하면 끝
  experimental_middleware: createParserMiddleware(),
  prompt: 'Search for the latest AI news',
});
```

OpenAI, Anthropic, Google, 오픈소스 모델 등 **어떤 프로바이더든** 동일한 코드로 사용할 수 있습니다.

### 완화된 JSON/XML 파서

표준 `JSON.parse()`는 엄격합니다. 홑따옴표, 후행 쉼표, 따옴표 없는 키 등을 모두 거부합니다. LLM 출력에는 이런 "거의 맞는" JSON이 빈번하게 등장합니다.

```typescript
// RJSON: Relaxed JSON Parser
// 다음을 모두 처리 가능:
// - 홑따옴표: {'key': 'value'}
// - 후행 쉼표: {"a": 1, "b": 2,}
// - 따옴표 없는 키: {key: "value"}
// - 주석: {"key": "value" /* comment */}
// - 잘린 JSON: {"key": "val

// RXML: Relaxed XML Parser
// 다음을 모두 처리 가능:
// - 닫는 태그 누락: <tool><name>search
// - 어트리뷰트 따옴표 누락: <tool name=search>
// - 네임스페이스 불일치
```

### 스키마 강제 변환

모델이 `"42"` (문자열)를 반환했지만 스키마가 `number`를 기대하는 경우, 자동으로 `42`로 변환합니다.

```typescript
const coerce = createSchemaCoercion(toolSchema);

// 입력: { "count": "42", "active": "true", "tags": "ai" }
// 출력: { "count": 42, "active": true, "tags": ["ai"] }
```

### OpenTelemetry 계측

각 스테이지의 성능과 실패를 추적하기 위해 OpenTelemetry를 도입했습니다.

```typescript
tracer.startActiveSpan('stage.planner', (span) => {
  span.setAttribute('stage.name', 'planner');
  span.setAttribute('tool.name', toolCall.name);
  span.setAttribute('parse.attempts', retryCount);
  span.setAttribute('parse.success', true);
  // ... 스테이지 로직
  span.end();
});
```

---

## 5. 배포 및 관측성

### 인프라 스택

```
코드 → Docker 컨테이너 → GCP Cloud Run → Kubernetes
         ↓                                    ↓
    Multi-stage Build              HPA (Horizontal Pod Autoscaler)
    (빌드 이미지 최소화)              (트래픽 기반 자동 스케일링)
```

### 관측성 체계

```yaml
# Prometheus 메트릭 예시
stage_pilot_tool_call_total{stage="planner", status="success"}: 3847
stage_pilot_tool_call_total{stage="planner", status="failure"}: 412
stage_pilot_parse_retry_total{strategy="ralph"}: 891
stage_pilot_parse_duration_seconds{quantile="0.95"}: 0.234
```

- **Prometheus**: 커스텀 메트릭 수집 (성공/실패 횟수, 파싱 시간, 재시도 횟수)
- **Datadog**: 대시보드 시각화 및 알림 설정
- **Terraform**: 전체 인프라를 코드로 관리 (IaC)

스테이지 게이트 패턴의 장점은, 어떤 스테이지에서 문제가 발생했는지 **즉시 파악**할 수 있다는 점입니다. "Planner에서 3번 재시도 후 실패"라는 로그 하나면, 디버깅의 시작점이 명확해집니다.

---

## 6. 결과 및 교훈

### 핵심 수치

- **25% -> 90%**: 3.6배 개선
- **파서 미들웨어만으로** 40%p 향상 (25% -> 65%)
- **RALPH 재시도 추가로** 25%p 추가 향상 (65% -> 90%)

### 남은 10%의 벽

남은 10%는 파서나 프롬프트 엔지니어링으로 해결할 수 없는 영역입니다. 모델이 도구의 존재 자체를 인식하지 못하거나, 완전히 새로운 도구 이름을 창작하는 경우입니다.

이를 해결하기 위해 별도 프로젝트 **tool-call-finetune-lab**을 진행 중입니다. LoRA 파인튜닝을 통해 모델 레벨에서 도구 호출 능력을 강화하는 접근입니다.

### 교훈

1. **스테이지 게이트는 디버깅을 단순하게 만든다**: 어디서 실패했는지 즉시 알 수 있으므로, 문제 해결 시간이 극적으로 단축됩니다.

2. **미들웨어 패턴은 채택을 용이하게 만든다**: 기존 코드를 변경하지 않고 한 줄 추가로 적용할 수 있어, 실제 프로덕션 도입 장벽이 낮습니다.

3. **완화된 파서가 엄격한 파서보다 실용적이다**: LLM 출력은 "거의 맞는" 경우가 대부분입니다. 엄격한 파서는 이를 모두 거부하지만, 완화된 파서는 대부분 복구합니다.

4. **재시도는 단순 반복이 아니라 증강이어야 한다**: 같은 프롬프트로 재시도하면 같은 실패가 반복됩니다. 이전 실패 원인을 힌트로 제공해야 성공률이 올라갑니다.

---

## 7. 앞으로의 계획

### 멀티 모델 비교

현재 벤치마크는 단일 모델 기준입니다. GPT-4o, Claude, Gemini, Qwen 등 다양한 모델에서 동일 벤치마크를 실행하여, 모델별 도구 호출 특성을 분석할 계획입니다.

### 벤치마크 확장

40개 케이스를 100개 이상으로 확장하여, 더 다양한 실패 패턴과 엣지 케이스를 커버할 예정입니다.

### 커뮤니티 미들웨어 프로토콜

`@ai-sdk-tool/parser`의 미들웨어 인터페이스를 표준화하여, 커뮤니티가 자체 파서와 복구 전략을 플러그인으로 기여할 수 있는 구조를 만들 계획입니다.

---

## 마치며

LLM 도구 호출의 신뢰성 문제는 모델이 발전할수록 줄어들겠지만, 당분간은 애플리케이션 레이어에서의 보정이 필수입니다. `stage-pilot`과 `@ai-sdk-tool/parser`는 이 보정을 체계적이고 측정 가능한 방식으로 수행합니다.

코드는 [GitHub](https://github.com/doeon-kim/stage-pilot)에서, 패키지는 `npm install @ai-sdk-tool/parser`로 사용할 수 있습니다.

---

**Doeon Kim** -- AI Engineer at INTERX. 프로덕션 수준의 AI 시스템을 설계하고 구축합니다. Microsoft AI School 출신. 한국어, 영어, 일본어 구사.
