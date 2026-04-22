# Design 12. Single-substrate sealed-object controller with explicit state machine

## Short Idea
Этот вариант делает дипломную систему контроллером над одной канонической единицей хранения: `sealed object`. Пока объект пишется, он живет в горячем replicated режиме; после sealing тот же объект проходит через небольшой и явно ограниченный state machine: `R3 -> H -> EC -> LRC`, где `R3` означает 3-way replication, `H` - hybrid replication + EC shadow, `EC` - pure erasure-coded state, а `LRC` - locality-optimized cold state. Важный сдвиг второй генерации в том, что decision engine больше не "угадывает" подходящий слой по разным гранулярностям сразу, а сначала проверяет, что объект sealed, что переход разрешен графом, и только потом считает стоимость.

Direct support from sources здесь идет только для сигнальных и механических частей: `HSM` дает heat + global utilization, `Morph` и `RapidRAID` показывают, что transition cost должен быть отдельной величиной, `Azure` и `f4` показывают sealing / warm-tier / background migration, а `ELECT` - что hotness-aware offloading можно встроить в существующий storage stack. Сам четырехсостоянийный контроллер и жесткое разделение на одну policy unit - это синтез поверх этих источников, а не прямое цитирование одного paper.

## Accent Subset
Этот вариант специально акцентирует:
- `azure_ec_atc_2012` - sealed extents, asynchronous background EC и placement across fault / upgrade domains.
- `ec_survey_tos_2024` - redundancy transitioning как first-class problem и язык для transition cost.
- `elect_fast_2024` - hotness-aware selective encoding и offloading менее горячих данных.
- `f4_osdi_2014` - warm tier, transparent migration и age/request rate как coarse temperature proxy.
- `hsm_ieee_access_2024` - heat + global disk utilization, threshold switching и hysteresis.
- `rapidraid_arxiv_2012` - pipelined replication-to-EC migration как отдельная оптимизируемая операция.

Именно этот поднабор задаёт тон варианту: не набор разрозненных слоев, а один sealed-object controller с формализованной политикой переходов. Остальные источники корпуса здесь работают как ограничители design space и как проверка того, что state machine не выходит за границы известных системных паттернов.

## Corpus Considered
Весь корпус `conspects/*.md` учитывается как общий контекст и как набор ограничений на допустимые design choices.

- EC-теория и переходы между кодами: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`.
- Lifecycle и hybrid storage: `morph_sosp_2024`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `elect_fast_2024`, `zebra_iwqos_2016`, `hsm_ieee_access_2024`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `heart_fast_2019`.
- Temperature, demand и infrastructure signals: `identifying_hot_cold_icde_2013`, `ec_store_icdcs_2018`.
- Benchmarking и evaluation framing: `benchmarking_ec_object_storage_fgcs_2025`.

Этот корпус нужен не только для related work. Он задаёт допустимые сигналы policy layer, допустимые семьи кодов, пределы для migration cost и те ограничения, которые не стоит ломать ради красивой архитектурной схемы.

## Problem
Дипломная система должна одновременно решать четыре задачи:
- hot data должны оставаться быстрыми на чтении и записи;
- cold data должны быть дешевыми по storage overhead;
- transitions между redundancy states не должны съедать всю экономию;
- placement и repair должны оставаться совместимыми с fault-domain и reliability constraints.

В этой версии есть еще одно требование: policy unit должна быть одна. Если контроллер начинает сравнивать file, extent, blob, SSTable и stripe как равноправные гранулярности, стоимость перехода становится несопоставимой, а decision engine теряет формальную основу. Поэтому мы выбираем `sealed object` как единственную unit of control: пока объект открыт, он не мигрирует; после sealing он либо остается в текущем состоянии, либо переходит только по разрешенному ребру графа.

Это и есть граница между direct support и synthesis: источники прямо подтверждают sealing, warm tiers, background migration, temperature signals и cheap transcode mechanics, а единая sealed-object policy unit - это уже наша архитектурная сборка.

## Architecture Components
Архитектура строится как control plane поверх storage data plane.

- `Telemetry collector` собирает access history, object age, read/write intensity, space pressure, repair backlog и reliability signals.
- `Seal detector` определяет, что объект больше не принимает writes и может участвовать в background transition.
- `State graph` хранит допустимые redundancy states и разрешенные ребра между ними.
- `Decision engine` выбирает target state и code family только после проверки guardrails и cost model.
- `Transition planner` строит конкретный conversion path для выбранного ребра и проверяет, укладывается ли он в допустимый budget.
- `Layout manager` раскладывает data, parity и replicas по fault domains и удерживает locality там, где repair traffic важнее.
- `Repair service` обслуживает degraded reads, rebuild и recovery after failures.
- `Metadata service` хранит текущий state, transition status, candidate target и mapping между sealed object и code family.
- `Code family registry` ограничивает search space только теми парами схем, для которых transition действительно дешевле full re-encode.

Важная дисциплина здесь простая: components не спорят о granularity. Они все смотрят на один sealed object и только внутри него решают, какое состояние и какой путь перехода допустимы.

## Data Layout
Единица управления здесь одна: `sealed object`.

- На уровне клиента объект остается объектом.
- На уровне хранения объект может быть разложен на chunks, blocks, extents или SSTable-like fragments в зависимости от backend.
- Для policy layer это не отдельные unit'ы управления, а только внутренние детали layout.
- Никакие chunks, replicas или parity blocks не мигрируют независимо друг от друга.

Базовый layout организован как конечный набор состояний:
- `R3` - 3-way replication для горячих объектов и чувствительного write path.
- `H` - hybrid state `replica + EC shadow`, где replica component держит быстрый критический путь, а EC уже готовит следующий шаг.
- `EC` - pure erasure-coded state, обычно RS или другая conversion-friendly MDS family.
- `LRC` - locality-optimized cold state, где cold object переходит в LRC или wide LRC.

Layout constraints:
- data и parity одной stripe не должны лежать в одном fault domain;
- local repair groups должны быть восстанавливаемыми без полного чтения stripe;
- `H` и `EC` должны быть conversion-friendly states, а не просто промежуточными ярлыками;
- metadata о state и transition хранится отдельно от data chunks;
- sealed objects могут мигрировать асинхронно, не блокируя client path;
- target family выбирается из registry, а не по эвристике на месте.

## Data Flow
Поток данных устроен как последовательность управляемых переходов между состояниями одного sealed object.

1. Новый объект попадает в `R3` и получает replication-first placement.
2. Telemetry слой собирает access history, age proxy, utilization и reliability signal.
3. Estimator обновляет temperature class и demand rank, но сам ничего не переключает.
4. Decision engine сравнивает текущее состояние только с допустимыми соседними states.
5. Если объект остывает и sealing уже наступил, он может перейти в `H`, где EC shadow подготавливается в фоне.
6. После подтвержденной стабилизации `H` переходит в `EC`, и replica component удаляется.
7. Если cold object получает устойчиво низкий demand, `EC` может перейти в `LRC`.
8. Reverse transitions идут только по соседнему ребру графа: `LRC -> EC -> H -> R3`.
9. Если transition cost или guardrail не проходят проверку, объект остается в текущем state.
10. Repair и migration выполняются асинхронно и отдельно от client critical path.

Direct support from sources здесь такой: `Azure` поддерживает sealing-before-EC и background transcode, `Morph` поддерживает cheap first transition and later conversion, `f4` поддерживает transparent migration for warm storage, `RapidRAID` поддерживает pipelined conversion, а `ELECT` поддерживает выборочную конверсию по hotness. Сам порядок `R3 -> H -> EC -> LRC` - это уже наша синтезированная state machine.

## Transition Graph
Граф переходов здесь важнее общего слова "tiering".

- `R3 -> H`: первый дешёвый переход для горячего, но уже остывающего объекта; он опирается на hybrid redundancy и background EC shadow.
- `H -> EC`: завершение первого охлаждения, когда replica component можно безопасно убрать.
- `EC -> LRC`: EC-to-EC transition для cold objects, где locality и repair traffic важнее минимального storage overhead.
- `No-op`: если expected gain меньше transition cost или edge запрещен registry.

Обратные ребра допускаются только как соседние переходы:
- `LRC -> EC`
- `EC -> H`
- `H -> R3`

Каждое ребро имеет собственную стоимость:
- `access cost` - сколько data нужно прочитать и записать;
- `transition IO` - сколько I/O съест migration;
- `transition network traffic` - сколько сети уйдет на copy / re-encode;
- `repair penalty` - насколько новый layout ухудшает recovery profile в worst case.

## Policy Layer
Policy layer здесь формализован как двухэтапный decision loop.

1. Сначала вычисляется множество feasible states для объекта: объект должен быть sealed, state graph должен разрешать ребро, а guardrails по reliability и placement не должны быть нарушены.
2. Затем среди feasible states выбирается состояние с минимальной ожидаемой стоимостью.

Рабочая формула решения:

```text
feasible(s) = sealed(o) && guardrails(s) && edge_exists(current, s)
score(s) = w_storage * storage_cost(s)
         + w_access * access_cost(s)
         + w_transition * transition_cost(s)
         + w_repair * repair_penalty(s)
         + w_reliability * reliability_penalty(s)
choose s* = argmin score(s) over feasible(s)
commit only if gain(s*) >= ε for 2 consecutive evaluation windows
```

- Температура данных оценивается по history of accesses на фиксированном окне, как в `HSM` и смежных temperature-aware работах.
- Global space pressure остается вторым управляющим сигналом, но только внутри множества reliability-feasible states.
- Reliability state конкретных disk groups выступает guardrail: если группа дисков выглядит хуже остальных, policy не должна отправлять туда чувствительные objects без необходимости.
- `EC` survey задает рамку, в которой transition cost и redundancy transitioning являются отдельной проблемой, а не побочным эффектом.
- Hysteresis нужен, чтобы система не дергалась между соседними states на шумных traces.

## Metrics / Evaluation Plan
Оценка должна смотреть не только на storage savings, но и на поведение transition path.

- `storage overhead` по состояниям и по всей системе;
- `read latency` и `tail latency` для hot и cold objects;
- `write latency` и влияние на ingest path;
- `access cost`, `transition IO` и `transition network traffic` для каждого edge отдельно;
- `repair traffic`, `degraded-read latency` и `recovery time`;
- `policy stability`, то есть частота лишних переключений и sensitivity к окну оценки;
- `migration efficiency`, то есть сколько I/O и сети съел transition относительно ожидаемой экономии;
- `illegal transition rate`, если controller иногда пытается перескочить через запрещенное ребро;
- `upload / download / delete / waiting time`, если evaluation проводится в object-storage-like режиме.

План сравнения:
- против `3-way replication`;
- против static RS;
- против static LRC;
- против hot/cold split без explicit state graph;
- против hybrid storage без explicit conversion-cost model;
- против temperature-aware policy без reliability guardrail;
- против reliability-aware policy без explicit transition budget.

Сценарии проверки:
- `Age-skewed lifecycle trace`: имитирует `f4` и related lifecycle work, где age и access rate определяют охлаждение.
- `Transition-heavy trace`: проверяет, окупаются ли `R3 -> H -> EC -> LRC` переходы на жизненном цикле object.
- `Reliability-heterogeneous placement`: использует `HeART`-style guardrail, чтобы проверить, что policy не выбирает запрещенные target states в слабых disk groups.
- `Size bands`: результаты нужно показывать отдельно по размерам object, потому что transition cost и repair traffic зависят от размера.

## Trade-offs / Risks / Assumptions
- Более гибкий pipeline улучшает steady-state баланс, но усложняет control plane и metadata.
- Conversion-friendly families ограничивают пространство допустимых схем, зато делают переходы дешевле и предсказуемее.
- LRC лучше для locality and repair, но не обязан быть лучшим выбором для всех cold workloads.
- Если temperature estimate шумный, система может начать oscillate между соседними states.
- Если background conversion слишком агрессивен, он начнет конкурировать с client I/O.
- Архитектура предполагает, что данные можно явно выделять в sealed objects, которые либо переводятся в background conversion, либо остаются в текущем state.
- Если инфраструктура неоднородна по надежности, reliability guardrail может перевесить чисто temperature-driven choice.
- Это управляемый компромисс, а не обещание универсальной оптимальности.

## Source Map
Direct support from sources:
- `hsm_ieee_access_2024`: heat + global disk utilization, threshold switching и hysteresis.
- `morph_sosp_2024`: lifecycle pipeline, hybrid redundancy и cheap first transition.
- `azure_ec_atc_2012`: sealed extents, asynchronous EC и placement across fault / upgrade domains.
- `f4_osdi_2014`: warm tier, transparent migration и age-based temperature proxy.
- `rapidraid_arxiv_2012`: pipelined archival migration from replication to EC.
- `elect_fast_2024`: hotness-aware tiering и offloading менее горячих данных.
- `ec_survey_tos_2024`: redundancy transitioning как отдельная проблема и vocabulary для migration cost.

Synthesis in this design:
- `sealed object` как единственная policy unit;
- state graph `R3 -> H -> EC -> LRC` с переходами только по соседним ребрам;
- two-stage decision engine: hard feasibility filter, then cost-based selection;
- explicit separation between direct source evidence and the architecture we build on top of it.

Supportive corpus constraints:
- `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `xoring_elephants_arxiv_2013` - cold-layer code families и transition-friendly design space;
- `ec_store_icdcs_2018` - latency-aware access and retrieval planning;
- `identifying_hot_cold_icde_2013` - batch temperature estimation and smoothing;
- `heart_fast_2019` - infrastructure reliability as a guardrail;
- `benchmarking_ec_object_storage_fgcs_2025` - evaluation vocabulary and object-storage testbed framing.

The boundary is intentional: sources justify the signals, the transition mechanics and the cost dimensions; the single-substrate controller and its restricted graph are the synthesis layer that the diploma can defend as its own architectural choice.
