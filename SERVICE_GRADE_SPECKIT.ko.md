# stage-pilot Service-Grade SPECKIT

Last updated: 2026-03-08

## S - Scope
- 대상: parser middleware + StagePilot orchestration + BenchLab eval tooling
- 이번 baseline 목표: canonical package contract, eval story, release 품질을 같은 언어로 정리

## P - Product Thesis
- 이 repo는 단순 실험 모음이 아니라 `도구 호출 파서 + orchestration + benchmark proof`를 보여주는 대표 레포여야 한다.
- 리뷰어는 패키지 surface, 예제 흐름, BenchLab 증거를 5분 안에 확인할 수 있어야 한다.

## E - Execution
- package export surface와 README quickstart를 중심으로 canonical repo posture 유지
- BenchLab / parser / StagePilot 흐름을 같은 품질 기준으로 검증
- release 전 typecheck, test, build, example smoke를 반복
- 이번 iteration에서 StagePilot/BenchLab 모두 runtime brief + review pack + schema surface를 API/UI에 추가

## C - Criteria
- `npm test`, `npm run typecheck`, `npm run build` green
- parser package 목적과 BenchLab 가치가 README 첫 화면에서 이해됨
- legacy 연구 레포와 역할 분리가 명확함
- `/demo`와 `/benchlab` 첫 화면에서 operator posture와 benchmark/artifact proof가 즉시 보임

## K - Keep
- parser contract 중심 설계
- 실험 결과를 문서와 테스트로 남기는 방식

## I - Improve
- CLI demo transcript와 benchmark delta 리포트 강화
- StagePilot orchestration screenshot / GIF 추가
- checked-in artifact promotion rules와 BenchLab job evidence 더 엄격히 연결
- hosted demo smoke와 checked-in review-pack screenshots 추가

## T - Trace
- `README.md`
- `docs/benchlab/`
- `src/`
- `tests/`
