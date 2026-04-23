# Упорядоченный план изучения литературы

Связанные документы:

- [README](./readme.md)
- [Формализованный бриф](./formal-brief.md)
- [Аудит покрытия корпуса](./source-coverage-audit.md)
- [@conspect-writer](./.codex/agents/conspect-writer.toml)
- [@conspect-reviewer](./.codex/agents/conspect-reviewer.toml)

## 1. Цель плана

Этот документ остаётся именно планом чтения литературы. Его задача не заменить архитектурный pipeline, а дать такой порядок чтения, при котором мы быстрее всего получаем:

- формальную постановку задачи;
- сильный related work;
- понятные архитектурные опоры для design phase;
- набор метрик и baseline'ов для evaluation.

План ниже синхронизирован с текущим состоянием проекта:

- в [sources/meta.json](./sources/meta.json) сейчас `27` источников;
- в `conspects/` сейчас `27` готовых конспектов, то есть корпус закрыт полностью;
- в `designs/` уже идёт архитектурная фаза, поэтому чтение теперь должно не только закрывать пробелы в литературе, но и направлять следующие design-итерации.

## 2. Текущее состояние

Что уже хорошо закрыто:

- базовый корпус по `replication`, `RS`, `LRC`, hybrid redundancy и `replication -> EC transition`;
- системные опоры для темы диплома: `Morph`, `HSM`, `ELECT`, `ER-Store`, `HyRES`, `Zebra`, `HeART`, `EC-Store`, `f4`, `PACEMAKER`, `Tiger`, `Cocytus`;
- теоретическая база по дешёвой перекодировке: `Convertible Codes`, `LRCC`, practical wide `LRC`;
- policy-level и workload-aware слой: `CBase-EC`, `GreenHDFS`, `Janus`, `HaRD`;
- benchmark vocabulary и evaluation methodology: `benchmarking_ec_object_storage_fgcs_2025` + `plank_fast_2009`.

Что всё ещё остаётся узким:

- мало end-to-end работ, где в одном месте соединены `temperature classification`, выбор схемы избыточности и безопасное исполнение переходов;
- блок orchestration и transition safety всё ещё тоньше и более разрознен, чем блоки по самим storage codes;
- evaluation framing уже закрыт лучше, но по-прежнему слабее по числу и влиянию, чем systems/design корпус;
- после закрытия корпуса главный дефицит уже не в отсутствии отдельных papers, а в synthesis между reading clusters.

Почему `study-plan` всё ещё нужен после появления `designs/`:

- он задаёт приоритеты чтения и reading clusters, которые должны влиять на новые архитектурные варианты;
- он помогает не раствориться в уже готовых design-идеях и удерживает связь с корпусом;
- он показывает, какие источники являются core drivers, а какие дают ограничения, baselines и evaluation framing.

## 3. Принцип порядка

Порядок чтения строится не по дате и не по venue, а по тому, как быстро источник помогает продвинуть диплом:

1. Сначала собрать общую карту `erasure coding` и понять, почему plain replication и plain RS недостаточны.
2. Затем разобрать два главных системных якоря диплома: lifecycle line (`Morph`) и temperature line (`HSM`).
3. После этого закрепить теорию переходов между кодами и practical constraints для `LRC`.
4. Потом добрать policy-level и orchestration-level работы, чтобы связать classification, scheme selection и execution.
5. В конце отдельно закрыть evaluation и benchmarking, чтобы дизайн не жил без измеримой проверки.

## 4. Ядро

Это минимальный набор, без которого не стоит фиксировать финальную постановку задачи и архитектурный каркас.

### 4.1 Общая карта EC и practical code choices

- `ec_survey_tos_2024`
  Что взять: общую taxonomy EC в storage systems, ключевые trade-off и vocabulary для related work.
- `azure_ec_atc_2012`
  Что взять: why LRC matters in practice, sealing/background EC, fault/upgrade domain placement.
- `xoring_elephants_arxiv_2013`
  Что взять: repair-efficiency motivation, locality vs overhead, cold-layer intuition.
- `wide_lrc_fast_2023`
  Что взять: какие LRC вообще реалистичны в больших системах и какие deployment constraints нельзя игнорировать.

### 4.2 Две опорные линии диплома

- `morph_sosp_2024`
  Что взять: lifecycle pipeline, hybrid early-life redundancy, cheap transitions и placement-aware orchestration.
- `hsm_ieee_access_2024`
  Что взять: temperature model, global utilization signal, hysteresis и policy-level migration logic.

### 4.3 Теория переходов между схемами

- `convertible_codes_it_2022`
  Что взять: formal language для conversion cost и границы выгодной перекодировки.
- `lrc_convertible_arxiv_2023`
  Что взять: locality-preserving conversion и ограничения для LRC-friendly transitions.

### 4.4 Core hybrid baselines

- `er_store_scientific_programming_2021`
  Что взять: metadata-driven hybrid policy и ограничения update-heavy path.
- `hyres_arxiv_2025`
  Что взять: formal hybrid baseline по storage cost, repair traffic и reliability loss.

Результат ядра:

- черновик постановки задачи;
- первый candidate pipeline схем хранения;
- список допустимых соседних переходов;
- минимальный набор baseline'ов для сравнения.

## 5. Расширение: Policy, Transitions, Orchestration

Этот слой нужен, чтобы архитектура не сводилась к “вот хороший pipeline кодов”, а реально учитывала execution cost, throttling и safety.

### 5.1 Temperature-aware и demand-aware policy

- `zebra_iwqos_2016`
  Что взять: demand-aware re-parameterization и bounded migration inside one family.
- `elect_fast_2024`
  Что взять: immutable-unit transitioning для LSM-tree storage, lifetime + access frequency, group-level metadata.
- `identifying_hot_cold_icde_2013`
  Что взять: low-overhead batch classification и smoothing вместо inline policy.
- `cbase_ec_electronics_2021`
  Что взять: explicit `hot <-> cold` conversion logic и bridge между classification и storage transformation.
- `greenhdfs_hotpower_2010`
  Что взять: практический взгляд на temperature-driven placement и стоимость миграций.
- `janus_atc_2013`
  Что взять: production-style workload characterization и tiering decisions.

### 5.2 Practical transition cost и safe execution

- `tpds17_ear_2017`
  Что взять: direct `replication -> EC transition` в clustered file systems и placement, который заранее учитывает будущую перекодировку.
- `rapidraid_arxiv_2012`
  Что взять: pipeline view на archival conversion и мысль, что migration path сам по себе надо оптимизировать.
- `heart_fast_2019`
  Что взять: reliability heterogeneity как отдельный safety signal, который может запрещать переходы.
- `pacemaker_osdi_2020`
  Что взять: transition overload, throttling и disk-adaptive safety.
- `tiger_osdi_2022`
  Что взять: более современное продолжение disk-adaptive redundancy без жёстких placement restrictions.
- `hard_jbigdata_2019`
  Что взять: чем опасно naively уменьшать replication factor и как topology/heterogeneity влияет на deletion path.

### 5.3 Systems context и deployment framing

- `ec_store_icdcs_2018`
  Что взять: latency-aware access planning внутри EC-layer и необходимость modelling movement cost.
- `f4_osdi_2014`
  Что взять: warm-storage lifecycle и честный production context для append/immutable data.
- `cocytus_fast_2016`
  Что взять: hybrid replication+EC как baseline вне file/object storage, чтобы видеть общность и границы подхода.

Результат этого блока:

- policy-level design без грубого `hot/cold`;
- список safety gates и throttling constraints;
- понимание, где lifecycle-policy ломается без group-level orchestration.

## 6. Evaluation и Benchmarking

Этот блок читается не первым, а тогда, когда уже понятны core pipeline и candidate transitions.

- `benchmarking_ec_object_storage_fgcs_2025`
  Что взять: benchmark vocabulary, common metrics и framing object-storage experiments.
- `plank_fast_2009`
  Что взять: как корректно сравнивать EC libraries и не путать claims про algorithmic quality с implementation noise.

Что нужно выписать отдельно:

- storage overhead;
- read/write latency для hot path;
- degraded-read latency;
- repair traffic и recovery time;
- transition IO и transition network traffic;
- queueing / waiting time для migration jobs;
- policy stability и transition usefulness;
- baselines, которые обязаны быть в сравнении.

## 7. Next Steps After Reading

Как использовать этот план после чтения:

1. Для каждого reading cluster собрать короткий synthesis:
   - `core pipeline drivers`
   - `transition constraints`
   - `orchestration/safety constraints`
   - `evaluation drivers`
2. Для system papers из ядра и orchestration-блока отдельно свести общую architectural matrix:
   - какой `operational mapping` использует paper;
   - какая у него `policy unit` и `execution unit`;
   - где принимается решение о transition;
   - какие safety gates и rollback semantics реально описаны.
3. Перед созданием нового design-варианта явно фиксировать, какой reading cluster играет роль:
   - core architectural driver;
   - constraints provider;
   - evaluation lens.
4. Для финального design loop проверять не только rubric-score, но и `NIR-match`: насколько новый вариант сохраняет тему, pipeline redundancy states, temperature framing, transition logic и реалистичную границу prototype/simulator из [formal-brief.md](./formal-brief.md) и [nir.txt](./nir.txt).
5. После фиксации нового design-варианта выпускать sidecar-артефакты:
   - диаграммы;
   - словарик;
   - короткий comparison memo против сильнейших предыдущих вариантов.

Как reading clusters должны влиять на design phase:

- `ядро` задаёт главный pipeline и candidate storage states;
- `policy / transitions / orchestration` задают admissible transitions, group-level execution и safety gates;
- `evaluation` задаёт метрики, baselines и shape of experiments.

Практический смысл:

- `study-plan.md` не выбирает архитектуру за нас;
- теперь он задаёт не только приоритеты чтения, но и порядок synthesis, из которого должны вытекать design choices;
- если новый design не может показать, какие reading clusters на него реально повлияли, значит связь между литературой и архитектурой слишком слабая.
