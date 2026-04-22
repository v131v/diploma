# Design 14. Sealed-unit state machine with adjacent redundancy transitions

## Short Idea
Этот вариант строит дипломную систему как управление одной единицей гранулярности: `sealed data unit` (`SDU`), то есть логически завершённым объектом хранения, который в policy layer рассматривается как атомарный. Для `SDU` задаётся одна явная state machine с четырьмя состояниями: `Hot-R3`, `Bridge-H`, `Cold-EC`, `DeepCold-LRC`. Переходы разрешены только между соседними состояниями, а decision engine оценивает не только текущую температуру данных, но и цену перехода, repair pressure и риск oscillation.

Сюжет этого варианта - не "найти лучший код вообще", а дисциплинированно связать lifecycle storage с cost-aware transitions. Источники напрямую поддерживают отдельные кирпичи этой схемы: `Morph` - lifecycle pipeline и дешевый первый переход, `ELECT` - hotness-aware tiering на уровне sealed storage units, `HyRES` - строгий trade-off между storage cost, loss probability и repair traffic, `LRC Convertible` - нижние границы access cost при conversion, `XORing Elephants` - locality-aware cold repair. Сама же связка в одну SDU-ориентированную state machine, с одним registry допустимых переходов и одним decision loop, - это уже мой synthesis поверх корпуса.

## Accent Subset
Этот вариант специально акцентирует:
- `ec_survey_tos_2024` - redundancy transitioning как first-class EC problem и общая рамка trade-off.
- `elect_fast_2024` - SSTable-level hotness-aware transitioning, background encoding и `alpha` как target savings knob.
- `hyres_arxiv_2025` - формальная hybrid redundancy model и явная цена storage / repair / loss trade-off.
- `lrc_convertible_arxiv_2023` - access-cost bounds for LRC conversion и ограничение на дешёвые EC-to-EC transitions.
- `morph_sosp_2024` - lifecycle pipeline, hybrid redundancy и cheap first transition from replica-heavy state.
- `xoring_elephants_arxiv_2013` - repair-efficient cold layer через locality и практический LRC-baseline.

Именно этот поднабор задаёт тон варианту: система должна уметь дешево удерживать горячие данные, не терять выгоду на миграциях и не разрушать locality в холодном слое.

## Corpus Considered
Весь корпус `conspects/*.md` учитывается как общий контекст и как набор ограничений на допустимые design choices. В этой версии особенно важны:

- EC survey and transition theory: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`.
- Hybrid lifecycle and temperature-aware storage: `morph_sosp_2024`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `elect_fast_2024`, `zebra_iwqos_2016`, `hsm_ieee_access_2024`.
- Temperature inputs, placement and workload context: `identifying_hot_cold_icde_2013`, `ec_store_icdcs_2018`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `heart_fast_2019`.
- Evaluation framing: `benchmarking_ec_object_storage_fgcs_2025`.

## Problem
Одна фиксированная схема хранения не закрывает сразу три требования:
- горячие данные должны читаться и писаться быстро;
- холодные данные должны быть дешевыми по storage overhead;
- переходы между состояниями не должны съедать экономию на storage и repair.

Если policy действует слишком грубо, система начинает oscillate между режимами или слишком рано платит за conversion. Если policy действует слишком мелко, metadata и transition traffic начинают доминировать над выигрышем. Поэтому нужна одна атомарная гранула управления и один явный automaton, который запрещает произвольные прыжки между кодовыми семействами.

## Architecture Components
Архитектура строится как control plane поверх data plane, где единственная управляющая единица - `SDU`.

- `Telemetry collector` собирает access history, lifetime, space pressure, repair backlog и failure signals.
- `Heat estimator` переводит историю обращений в сглаженную heat class и сигнал жизненной стадии.
- `Decision engine` выбирает target state, но только из допустимых adjacent states и только после проверки guardrails.
- `State registry` хранит текущий state `SDU`, последний reason for change, target state и разрешённые next states.
- `Transition planner` строит background conversion path и помечает, нужно ли cheap transition или full re-encode.
- `Layout manager` раскладывает replicas, data chunks и parity chunks по fault domains и, где нужно, сохраняет locality.
- `Repair and recovery service` обслуживает degraded reads, recovery и background rebuild.
- `Benchmark harness` фиксирует upload/download/delete/waiting time, repair traffic и recovery cost для одинаковых traces.

Эта раскладка сознательно проста: один substrate, один registry, один policy loop. Это не набор независимых subsystems, а одна система принятия решений, где каждый компонент знает только про `SDU` и про его текущий state.

## Data Layout
Базовый layout организован как четыре состояния одной и той же `SDU`.

- `Hot-R3`: три реплики, writable и latency-first state для ingest и активного чтения.
- `Bridge-H`: гибридный слой `replica + EC`, который держит быстрый read path и одновременно подготавливает экономичный cold path.
- `Cold-EC`: pure EC state на transition-friendly RS или compatible EC family.
- `DeepCold-LRC`: wide LRC state для deep cold data, где repair locality и recovery cost важнее простого storage minimum.

Правила гранулярности:
- `SDU` является единственной единицей миграции, repair и policy decision.
- `chunks`, `replicas` и `parity` не мигрируют независимо друг от друга на уровне policy.
- У `SDU` всегда есть ровно один active state и, при необходимости, один background target state.
- `Bridge-H` используется как единственный допустимый переходный буфер, а не как вечное промежуточное болото.
- Если переход требует изменить chunking или family layout, это уже `full re-encode`, а не cheap conversion.

Сама идея `SDU` здесь - наш synthesis. Из источников напрямую следует, что file-lifetime, SSTable-level и object-level management все работают на одной и той же управляемой сущности; мы сводим их к одной абстракции, чтобы policy не распадалась на разные granularity rules.

## Data Flow
1. Новый `SDU` сначала попадает в `Hot-R3`.
2. Как только unit becomes sealed, он получает право на переходы в `Bridge-H` или `Cold-EC`.
3. Telemetry collector накапливает access window и обновляет heat estimate, lifetime stage и pressure signals.
4. Decision engine сравнивает только соседние states и отклоняет любые прыжки через state machine.
5. Если hotness падает, `Hot-R3 -> Bridge-H` запускает background preparation of EC layout.
6. Когда transition debt окупается, `Bridge-H -> Cold-EC` убирает лишние реплики и оставляет EC layout как основной.
7. Если данные стабильно холодны и repair locality важнее плотности кода, выполняется `Cold-EC -> DeepCold-LRC`.
8. Reverse transitions разрешены только по обратным соседним ребрам: `DeepCold-LRC -> Cold-EC -> Bridge-H -> Hot-R3`.
9. Если candidate state требует несовместимый code family, transition planner выбирает full re-encode или запрещает переход.
10. Все background moves are throttled и не должны занимать client critical path.

Этот flow - тоже synthesis. Источники дают куски: Morph показывает lifecycle transitions, ELECT показывает selective encoding/offloading, HSM - влияние utilization, Xorbas - выгодный cold repair, а survey - цену redundancy transitioning. Мы собираем из этого один жесткий automaton.

## Policy Layer
Policy layer здесь разделяется на две зоны: то, что поддержано источниками напрямую, и то, что добавлено как наш синтез.

### Directly Supported By Sources
- `Heat` и access frequency как базовый сигнал выбора состояния.
- `Lifetime` и stage-of-life как второй сигнал для ранжирования объектов/SSTables/files.
- `Global space pressure` как дополнительный управляющий фактор.
- `Transition cost` и `access cost` как отдельные величины, а не побочный эффект.
- `Repair locality`, `repair traffic` и `degraded-read cost` как обязательные ограничения для cold layer.
- `Hybrid redundancy` как допустимый bridge state между replication и EC.

### Synthesis
- `Decision engine` работает lexicographically: сначала safety/compatibility guardrails, потом допустимость adjacent state, потом projected total cost, потом hysteresis.
- `Projected total cost` объединяет storage overhead, transition IO, transition network traffic, repair penalty и state-change penalty.
- `Hysteresis` требует подтверждения в нескольких evaluation windows, чтобы не получить oscillation.
- `Code family registry` запрещает прыжки между несовместимыми layout families без полного пересчёта.
- `Bridge-H` становится обязательным смягчающим слоем между hot replication и cold EC, если transition cost еще не окупился.

Decision rule в коротком виде:
1. Reject states that violate reliability or locality guardrails.
2. Consider only adjacent transitions in the state machine.
3. Rank admissible states by projected total cost in the current window.
4. Commit only if gain exceeds transition debt and survives hysteresis.

Это место особенно важно для границы между источниками и синтезом. Сами papers не дают готового `one-loop policy`; они дают сигналы и ограничения. Вариант дипломной системы - это мой synthesis, который сводит их в один deterministic decision engine.

## Metrics / Evaluation Plan
Оценка должна измерять не только storage savings, но и стоимость переходов между состояниями.

- `Storage overhead` по каждому state и по всей системе.
- `Read latency` и `write latency` для hot `SDU`.
- `Upload`, `download`, `delete` и `waiting time` как object-storage-style runtime metrics.
- `Transition IO` и `transition network traffic`.
- `Repair traffic`, `degraded-read latency` и `recovery time`.
- `Policy stability`, то есть частота лишних переключений и длина oscillation bursts.
- `State accuracy`, то есть доля `SDU`, чья текущая redundancy state соответствует фактической hotness.
- `Transition debt payback`, то есть за сколько workload windows окупается conversion.

План сравнения:
- против static 3-way replication;
- против static RS;
- против static LRC;
- против threshold-only hot/cold policy;
- против lifecycle pipeline без explicit transition-cost model;
- против hybrid policy без adjacent-state restriction.

План экспериментов:
- `Trace replay` на hot/warm/cold access traces;
- `Lifecycle replay` с искусственным охлаждением sealed units;
- `Transition stress` для каждого edge state machine;
- `Fault injection` во время background conversion;
- `Capacity pressure sweep` для проверки роли global space utilization.

## Trade-offs / Risks / Assumptions
- Более жёсткая state machine уменьшает риск хаотичных переключений, но делает policy менее гибкой.
- `Bridge-H` снижает цену первого перехода, но добавляет metadata и промежуточное состояние.
- `DeepCold-LRC` улучшает repair locality, но может быть хуже по raw storage efficiency, чем чистый EC.
- Если heat estimate шумный, `SDU` может застревать в `Bridge-H`.
- Если granularity слишком крупная, hot spots внутри `SDU` будут маскироваться и policy запоздает.
- Если granularity слишком мелкая, metadata overhead и conversion traffic могут съесть пользу от EC.
- Предполагается, что unit становится transition-eligible только после sealing.
- Предполагается, что family registry может заранее перечислить допустимые adjacent transitions.
- Для объектного, file и SSTable контекстов мы используем одну абстракцию `SDU` как сознательный synthesis, а не как прямую цитату из любого одного paper.

## Source Map
### Direct Anchors
- `ec_survey_tos_2024`: даёт рамку `redundancy transitioning`, storage/performance/reliability trade-off и язык для оценки transition cost.
- `elect_fast_2024`: показывает hotness-aware SSTable transitioning, background encoding, offloading и явный storage-saving target.
- `hyres_arxiv_2025`: формализует hybrid redundancy и связывает storage cost, file loss probability и repair traffic.
- `lrc_convertible_arxiv_2023`: даёт lower bounds на access cost и показывает, что LRC-conversion нельзя делать "бесплатной" по желанию policy.
- `morph_sosp_2024`: показывает file-lifetime pipeline, hybrid redundancy и почти бесплатный первый переход к EC.
- `xoring_elephants_arxiv_2013`: задаёт locality-aware cold layer и практический repair-efficient baseline для LRC.

### Supporting Corpus Constraints
- `convertible_codes_it_2022`: формальная база для EC-to-EC conversion cost.
- `wide_lrc_fast_2023`: practical wide LRC constraints и locality-aware placement.
- `azure_ec_atc_2012`: production-minded EC/LRC placement и background processing ideas.
- `zebra_iwqos_2016`: demand-aware ranking inside EC tiers.
- `hsm_ieee_access_2024`: heat plus utilization as dual policy signals and hysteresis intuition.
- `er_store_scientific_programming_2021`: hot/warm/cold policy and conversion table as a hybrid baseline.
- `ec_store_icdcs_2018`: latency-aware EC access and chunk movement as a cost model input.
- `identifying_hot_cold_icde_2013`: hot/cold classification by access history.
- `benchmarking_ec_object_storage_fgcs_2025`: metrics vocabulary for benchmark design.
- `rapidraid_arxiv_2012`, `f4_osdi_2014`, `heart_fast_2019`: migration, warm-tier and reliability context for boundary cases.

### What Is Synthesis Here
- The single `SDU` substrate.
- The four-state machine with adjacent-only transitions.
- The lexicographic decision order with hysteresis.
- The obligation to use `Bridge-H` as the unique transition buffer.
- The explicit separation between direct evidence from papers and the policy wrapper I propose on top.

## Source Boundary
Ниже - короткая граница, которую я в этом варианте сознательно держу:

- Источники напрямую говорят, что transitions есть, что они дорогие, что hotness/lifetime/utilization/reliability matter, и что conversion cost must be modeled.
- Источники напрямую показывают, что hybrid redundancy, selective EC, LRC and locality-aware repair are practical building blocks.
- Источники не дают единого `one-granularity / one-automaton / one-decision-engine` blueprint.
- Поэтому вся SDU-ориентированная state machine, adjacent-only policy и bridge-state discipline - это мой synthesis, собранный из корпуса и ограниченный корпусом.
