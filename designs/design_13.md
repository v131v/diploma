# Design 13. Sealed-extent policy engine with explicit conversion budget

## Short Idea
Этот вариант делает дипломную систему предельно дисциплинированной: единственная единица управления - `sealed extent`, а все решения принимаются только после seal, вне критического пути записи. Горячие extents остаются в `3-way replication`, переходный слой удерживает данные в `2-way replication` как короткий warm state, а холодный слой переводит extents в EC-режим с заранее фиксированным family. Решение принимает не эвристика в свободной форме, а явный decision engine, который смотрит на heat, global space pressure, conversion cost, latency headroom и reliability guardrails, после чего разрешает только соседние переходы в конечном state machine.

## Accent Subset
Этот вариант специально акцентирует:
- `azure_ec_atc_2012` - sealed extents, asynchronous background EC и placement across fault / upgrade domains.
- `convertible_codes_it_2022` - conversion cost как отдельная величина и формальная цена переходов между EC-схемами.
- `ec_store_icdcs_2018` - latency-aware retrieval и то, что EC нельзя оценивать только по storage savings.
- `f4_osdi_2014` - warm BLOB layer как промежуточное состояние между hot path и cold storage.
- `hsm_ieee_access_2024` - heat + global disk utilization + hysteresis как базовый policy pattern.
- `identifying_hot_cold_icde_2013` - batch hot/cold classification по истории обращений и разделение classifier'а и runtime path.

Именно этот поднабор задаёт дисциплину варианта: сначала определить измеряемую температуру и состояние системы, затем разрешить только те переходы, чья стоимость явно помещается в бюджет.

## Corpus Considered
Весь корпус `conspects/*.md` учитывается как общий фон и как набор ограничений на design space.

- EC-теория и conversion: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`.
- Hybrid storage и lifecycle management: `morph_sosp_2024`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `elect_fast_2024`, `zebra_iwqos_2016`, `hsm_ieee_access_2024`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `heart_fast_2019`.
- Temperature / demand inputs: `identifying_hot_cold_icde_2013`, `ec_store_icdcs_2018`.
- Benchmarking и системный контекст: `benchmarking_ec_object_storage_fgcs_2025`.

## Problem
Если не ввести явный decision engine, система начинает смешивать три разные вещи:

- оценку температуры данных;
- выбор допустимой схемы хранения;
- цену перехода между схемами.

В результате политика становится неаудируемой: heat signal может толкать данные в более дешёвый слой, но conversion cost и latency penalty съедают выгоду. Для диплома это особенно важно, потому что корректная архитектура должна отвечать не только на вопрос "куда положить данные сейчас", но и на вопрос "какие переходы вообще допустимы и сколько они стоят". Без этого temperature-aware storage превращается в набор плохо согласованных эвристик.

## Architecture Components
Архитектура строится как control plane поверх extent-oriented data plane.

- `Telemetry collector` собирает access history, age, write/read intensity, disk utilization, repair backlog и сигналы по fault / upgrade domains.
- `Heat estimator` переводит историю обращений в сглаженную температуру extents; это прямое продолжение идеи batch classification.
- `Space-pressure monitor` отслеживает global utilization и включает второй управляющий сигнал.
- `Decision engine` выбирает следующий state только из разрешённых соседних переходов и не пытается оптимизировать всю траекторию за один шаг.
- `Allowed transition registry` хранит конечный автомат состояний и список допустимых edges между ними.
- `Conversion planner` оценивает IO cost, network traffic и latency penalty для конкретного перехода и решает, можно ли его выполнить в рамках бюджета.
- `Placement manager` раскладывает replicas и EC fragments по fault / upgrade domains и проверяет, что layout остаётся repairable.
- `Repair and recovery service` обслуживает degraded reads, reconstruction и rebuild после отказов.
- `Metadata service` хранит текущий state extent'а, timestamp последнего решения, reason code и целевой state для background migration.

Direct source support здесь дают `Azure`, `HSM`, `Convertible Codes`, `f4` и `Identifying Hot and Cold Data`; synthesis состоит в том, что все эти примитивы сведены в один явный control loop.

## Data Layout
Единственная единица управления - `sealed extent`. Live writes не участвуют в decision engine, пока extent не seal'ится.

Состояния layout:

- `R3`: 3-way replication для hot extents.
- `R2`: 2-way replication как warm state и короткий переходный слой.
- `EC`: холодный слой на заранее выбранном erasure-code family.

Allowed transitions:

- `R3 -> R2`
- `R2 -> R3`
- `R2 -> EC`
- `EC -> R2`

Запрещённые переходы по умолчанию:

- `R3 -> EC` в один шаг;
- `EC -> R3` в один шаг;
- любой переход, который требует сменить unit granularity или repartitioning extents.

Правило простое: если системе нужен "скачок" через две ступени, он должен быть разложен на две соседние миграции. Это делает стоимость каждого шага видимой и не прячет её внутри большого re-encode.

Layout constraints:

- data и parity не должны попадать в один fault domain;
- decision engine работает только по sealed extents;
- EC family выбирается заранее и не переизобретается на каждом переходе;
- metadata о state хранится отдельно от data fragments;
- background transition не должен блокировать client path;
- reverse transition разрешён только если heat реально вырос, а не из-за шума окна оценки.

## Data Flow
1. Клиентские записи попадают в active replicated extent и обслуживаются без участия policy layer.
2. Когда extent seal'ится, он становится eligible для temperature evaluation.
3. `Heat estimator` и `Space-pressure monitor` формируют snapshot для decision engine.
4. Decision engine выбирает только один admissible next state из списка соседних переходов.
5. `Conversion planner` проверяет conversion cost, placement feasibility и latency guardrail.
6. Если переход разрешён, background job выполняет `R3 -> R2` или `R2 -> EC` без остановки client traffic.
7. После успешной конверсии metadata flips to the new state, а old layout удаляется только после подтверждения.
8. Reads для hot extents идут через replicas, reads для cold extents идут через EC reconstruction only when needed.
9. Если heat снова растёт, extent возвращается только на один соседний шаг назад.

Direct support from sources здесь даёт `Azure` для sealed-extents pipeline, `HSM` для двух сигналов управления, `Identifying Hot and Cold Data` для отделения classifier'а от runtime path, а synthesis состоит в том, что все эти этапы сведены в один extent-level loop.

## Policy Layer
Policy layer формализован как rule-based state machine, а не как свободная эвристика.

### Inputs
- `heat(extent)`: сглаженная частота обращений за окно.
- `utilization(cluster)`: общая заполненность дисков.
- `conversion_cost(s -> s')`: оценка I/O и network traffic для перехода.
- `latency_penalty(s')`: ожидаемый эффект на read / write latency.
- `reliability_penalty(s')`: риск ухудшения доступности и repairability.

### Admissibility
Переход `s -> s'` разрешён только если:

- `s'` находится в allowed transition registry как соседнее состояние;
- placement feasibility не нарушена;
- ожидаемая conversion cost не превышает budget for this window;
- reliability guardrail остаётся выше минимального порога;
- целевой state не ухудшает latency сильнее, чем допускает SLO.

### Decision Rule
Decision engine выбирает state с максимальным score среди admissible candidates:

`score(s') = w_h * heat_fit + w_u * space_fit + w_l * latency_fit - w_c * conversion_cost - w_r * reliability_penalty`

Правила дисциплины:

- если лучший candidate не лучше текущего state на заданный margin, transition не запускается;
- если candidate меняется из-за шума, hysteresis удерживает текущий state;
- если нужен двухшаговый переход, он исполняется как последовательность соседних edges;
- если source state и target state требуют разных granularity, решение отклоняется как not admissible.

Это место, где boundary between direct support and synthesis особенно важен: `HSM` даёт два сигнала и hysteresis, `Convertible Codes` даёт conversion cost, `EC-Store` даёт latency guardrail, а сама state machine и score function - это уже синтез для диплома.

## Metrics / Evaluation Plan
Оценка должна измерять не только steady-state экономию, но и цену самой политики.

- `storage overhead` по состояниям `R3 / R2 / EC`.
- `read latency` для hot, warm и cold extents.
- `write latency` в active path.
- `conversion IO` и `conversion network traffic`.
- `conversion time` и queueing delay для background jobs.
- `repair traffic` и `degraded-read latency`.
- `policy stability`, то есть частота лишних переключений.
- `SLO violations` в момент переходов.
- `budget adherence`, то есть доля переходов, выполненных в рамках расчётного cost envelope.

План сравнения:

- против `3-way replication` без temperature policy;
- против static EC;
- против `HSM`-like policy без explicit conversion cost;
- против hot/cold binary split без warm state;
- против background conversion без admissibility check.

План эксперимента:

- `Trace replay` на одном и том же extent set с разными heat traces;
- `Space pressure replay` со сменой utilization profiles;
- `Transition stress` для каждого allowed edge отдельно;
- `Fault injection` во время background conversion;
- `Warm-state churn` с быстрыми сменами hot/warm/cold, чтобы проверить hysteresis.

## Trade-offs / Risks / Assumptions
- Жёсткое ограничение на allowed transitions упрощает control plane, но может ухудшить адаптивность на очень резких workload shifts.
- Решение на уровне sealed extent делает политику auditable, но может оставить внутри одного object несколько extents в разных состояниях.
- Warm state `R2` снижает стоимость первого охлаждения, но добавляет ещё один уровень metadata и ещё один источник oscillation.
- Если heat estimate шумный, hysteresis будет защищать систему ценой некоторой инерции.
- Если conversion budget слишком консервативен, система будет слишком долго держать данные в дорогом state.
- Предполагается, что placement manager умеет проверять fault / upgrade domains и что metadata service надёжен.
- Предполагается, что EC family выбран заранее и не меняется динамически на каждом window; это осознанное ограничение ради дисциплины модели.

## Source Map
### Direct support from the accent subset
- `identifying_hot_cold_icde_2013`: batch hot/cold classification, smoothing и отделение классификатора от runtime path.
- `hsm_ieee_access_2024`: heat + global utilization + hysteresis как policy skeleton.
- `azure_ec_atc_2012`: sealed extents, asynchronous background EC, placement and repair substrate.
- `convertible_codes_it_2022`: conversion cost как отдельная величина и why transitions are not free.
- `ec_store_icdcs_2018`: latency-aware EC retrieval и необходимость учитывать access cost.
- `f4_osdi_2014`: warm tier как отдельная стадия lifecycle.

### Supporting corpus constraints
- `morph_sosp_2024`: lifecycle pipeline и staged redundancy как системный шаблон.
- `er_store_scientific_programming_2021`: hot / warm / cold policy и table-driven migration.
- `hyres_arxiv_2025`: hybrid redundancy как baseline для storage cost / repair traffic trade-off.
- `elect_fast_2024`: selective tiering по hotness и background offloading.
- `zebra_iwqos_2016`: demand-aware policy и rank-based adaptation.
- `rapidraid_arxiv_2012`: pipelined archival migration from replication to EC.
- `heart_fast_2019`: reliability heterogeneity как дополнительный guardrail.
- `ec_survey_tos_2024`: broad framing of redundancy transitions as a first-class EC problem.
- `xoring_elephants_arxiv_2013`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`: repair-efficient cold layers, locality и practical conversion constraints.
- `benchmarking_ec_object_storage_fgcs_2025`: evaluation vocabulary for object/storage benchmarks.

### Synthesis
- Один `sealed extent` как единственная unit of control.
- Один explicit decision engine, который выбирает только соседние transitions.
- Один conversion budget, который делает цену миграции observable и comparable.
- Ясная граница: источники дают primitives, а дипломный вариант связывает их в auditable state machine.
