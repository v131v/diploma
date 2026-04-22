# Design 11. Sealed object-stripe controller with formal transition graph

## Short Idea
Этот вариант делает систему не просто температурным pipeline, а управляемым controller'ом для одной канонической единицы хранения: `sealed object stripe`. Объект виден системе как одна логическая сущность, а stripe - как единственная внутренняя гранулярность для хранения, repair и migration. Все состояния, от replication до LRC, являются разными представлениями одной и той же единицы, а не отдельными слоями с разной логикой. Решение о смене состояния принимает явный decision engine, который смотрит на temperature, demand rank, space pressure, conversion cost и reliability guardrails, а затем разрешает только соседние переходы по заранее описанному графу.

## Accent Subset
Этот вариант специально акцентирует:
- `convertible_codes_it_2022` - формальная цена conversion и ограничение на cheap EC-to-EC transitions.
- `ec_store_icdcs_2018` - access planning внутри EC-слоя и связь latency с retrieval, а не только с decoding.
- `heart_fast_2019` - reliability heterogeneity как отдельный сигнал для выбора redundancy.
- `lrc_convertible_arxiv_2023` - conversion с сохранением locality и lower bound на access cost.
- `wide_lrc_fast_2023` - практичный cold-layer LRC и placement constraints для широких stripes.
- `zebra_iwqos_2016` - demand-ranked tiering и многоуровневый выбор EC-параметров.

Именно этот поднабор задаёт тон варианту: не просто hot/warm/cold деление, а единый control loop для sealed object stripes, где policy одновременно понимает demand, transition cost и repair profile.

## Corpus Considered
Весь корпус `conspects/*.md` учитывается как общий контекст и как набор ограничений на допустимые design choices.

- EC-теория и переходы между кодами: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`.
- Lifecycle и hybrid storage: `morph_sosp_2024`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `elect_fast_2024`, `zebra_iwqos_2016`, `hsm_ieee_access_2024`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `heart_fast_2019`.
- Temperature, demand и infrastructure signals: `identifying_hot_cold_icde_2013`, `ec_store_icdcs_2018`.
- Benchmarking и system context: `benchmarking_ec_object_storage_fgcs_2025`.

## Problem
Дипломная система должна одновременно решать четыре задачи:
- hot data должны оставаться быстрыми на чтении и записи;
- cold data должны быть дешёвыми по storage overhead;
- transitions между redundancy states не должны съедать всю экономию;
- placement и repair должны оставаться совместимыми с fault-domain и reliability constraints.

Проблема здесь не только в выборе конечного кода. Система обязана понимать:
- когда объект уже достаточно остыл для sealing;
- какой next state вообще допустим;
- сколько I/O, сети и background work съест transition;
- не испортит ли новый layout degraded reads и recovery.

Поэтому архитектура строится как один control plane поверх одного substrate, а не как набор слабо связанных policies.

## Architecture Components
Архитектура строится как control plane поверх storage data plane.

- `Telemetry collector` собирает access history, object age, read/write intensity, space pressure, repair backlog и reliability signals.
- `Temperature and demand estimator` переводит историю обращений в heat score, demand rank и transition eligibility.
- `State graph` хранит допустимые redundancy states и разрешённые ребра между ними.
- `Decision engine` выбирает target state, code family и placement profile только после проверки guardrails и cost model.
- `Transition planner` строит конкретный conversion path для выбранного ребра и проверяет, укладывается ли он в допустимый budget.
- `Layout manager` раскладывает data, parity и replicas по fault domains и удерживает locality там, где repair traffic важнее.
- `Repair service` обслуживает degraded reads, rebuild и recovery after failures.
- `Metadata service` хранит текущий state, transition status, candidate target и mapping между object stripe и code family.
- `Code family registry` ограничивает search space только теми парами схем, для которых conversion действительно дешевле full re-encode.

## Data Layout
Единица управления здесь одна: `sealed object stripe`.

- На уровне клиента объект остаётся объектом.
- На уровне хранения объект представлен stripe-структурой, и именно stripe является минимальной unit для migration.
- Никакие chunks, replicas или parity blocks не мигрируют независимо друг от друга.

Базовый layout организован как конечный набор состояний:
- `R3` - 3-way replication для горячих объектов и чувствительного write path.
- `H` - hybrid state `replica + EC shadow`, где replica component держит быстрый критический путь, а EC уже готовит следующий шаг.
- `E` - pure EC state, обычно RS или другой conversion-friendly MDS family.
- `L` - locality-optimized cold state, где cold stripe переходит в LRC или wide LRC.
- `A` - archival refinement, если нужен ещё более стабильный cold layout с учётом maintenance constraints.

Layout constraints:
- data и parity одной stripe не должны лежать в одном fault domain;
- local repair groups должны быть восстанавливаемыми без полного чтения stripe;
- `H` и `E` должны быть conversion-friendly states, а не просто промежуточными ярлыками;
- metadata о state и transition хранится отдельно от data chunks;
- sealed stripes могут мигрировать асинхронно, не блокируя client path;
- target family выбирается из registry, а не по эвристике на месте.

## Data Flow
Поток данных устроен как последовательность управляемых переходов между состояниями одной stripe.

1. Новый объект попадает в `R3` и получает replication-first placement.
2. Telemetry слой собирает access history, age proxy, utilization и reliability signal.
3. Estimator обновляет temperature class и demand rank, но сам ничего не переключает.
4. Decision engine сравнивает текущий state с допустимыми соседними states.
5. Если объект остывает, он переходит в `H`, где EC shadow подготавливается в фоне.
6. После sealing `H` переходит в `E`, и replica component удаляется.
7. Если cold stripe получает устойчиво низкий demand, `E` может перейти в `L`.
8. Если layout registry разрешает ещё более locality-aware archival state, `L` может перейти в `A`.
9. Reverse transitions идут только по соседнему ребру графа: `A -> L -> E -> H -> R3`.
10. Если transition cost или guardrail не проходят проверку, stripe остаётся в текущем state.
11. Repair и migration выполняются асинхронно и отдельно от client critical path.

## Transition Graph
Граф переходов здесь важнее общего слова "tiering".

- `R3 -> H`: первый дешёвый переход для горячей, но уже остывающей stripe; он опирается на `Morph`-style first conversion.
- `H -> E`: завершение first cooling, когда replica component можно безопасно убрать.
- `E -> L`: EC-to-EC transition для cold stripes, где locality и repair traffic важнее минимального overhead.
- `L -> A`: optional archival refinement, если wide LRC или другой locality-aware cold layout даёт лучший repair profile.
- `No-op`: если expected gain меньше transition cost или edge запрещён registry.

Каждое ребро имеет собственную стоимость:
- `access cost` - сколько data нужно прочитать и записать;
- `transition IO` - сколько I/O съест migration;
- `transition network traffic` - сколько сети уйдёт на copy / re-encode;
- `repair penalty` - насколько новый layout ухудшает recovery profile в worst case.

## Policy Layer
Policy layer здесь не бинарный и не сводится к одному порогу.

- Температура данных оценивается по history of accesses на фиксированном окне, как в `Identifying Hot and Cold Data`.
- Demand ranking используется вместо грубого `hot/cold`, если workload сильно skewed.
- Global space pressure остаётся вторым управляющим сигналом, но только внутри множества reliability-feasible states.
- Reliability state конкретных disk groups выступает guardrail: если группа дисков выглядит хуже остальных, policy не должна отправлять туда чувствительные stripes без необходимости.
- `EC-Store`-style latency guardrail не позволяет выбрать хороший по объёму, но медленный по retrieval вариант там, где важна пользовательская latency.
- `Decision rule` сначала фильтрует candidate states через state graph и registry, а потом сравнивает expected steady-state gain с conversion cost и repair cost.
- `Hysteresis` нужен, чтобы система не дёргалась между соседними states на шумных traces.

Рабочая формула решения:
- отбрасываются states, которые нарушают reliability guardrail или layout restriction;
- среди допустимых states считается total cost: `storage overhead + access cost + transition IO + repair penalty + reliability penalty`;
- transition разрешается, если candidate state даёт выигрыш больше заданного margin относительно текущего state;
- если несколько переходов дают близкий результат, выбирается более короткий путь по графу.

## Metrics / Evaluation Plan
Оценка должна смотреть не только на storage savings, но и на поведение transition path.

- `storage overhead` по состояниям и по всей системе;
- `read latency` и `tail latency` для hot и cold stripes;
- `write latency` и влияние на ingest path;
- `access cost`, `transition IO` и `transition network traffic` для каждого edge отдельно;
- `repair traffic`, `degraded-read latency` и `recovery time`;
- `placement robustness`, `MTTDL` и доля stripes, которые остаются в допустимой reliability zone;
- `policy stability`, то есть частота лишних переключений и sensitivity к окну оценки;
- `migration efficiency`, то есть сколько I/O и сети съел transition относительно ожидаемой экономии;
- `upload / download / delete / waiting time`, если evaluation проводится в object-storage-like режиме.

План сравнения:
- против `3-way replication`;
- против static RS;
- против static LRC;
- против hot/cold split без explicit transition graph;
- против hybrid storage без explicit conversion-cost model;
- против policy, которая учитывает только temperature, но игнорирует reliability;
- против policy, которая учитывает только reliability, но игнорирует demand.

Сценарии проверки:
- `Age-skewed lifecycle trace`: имитирует F4, ELECT и related lifecycle work, где age и access rate определяют охлаждение.
- `Transition-heavy trace`: проверяет, окупаются ли `R3 -> H -> E -> L` переходы на жизненном цикле stripe.
- `Reliability-heterogeneous placement`: использует HeART-style guardrail, чтобы проверить, что policy не выбирает запрещённые target states в слабых disk groups.
- `Size bands`: результаты нужно показывать отдельно по размерам stripe, потому что conversion cost и repair traffic зависят от размера.

## Trade-offs / Risks / Assumptions
- Более гибкий pipeline улучшает steady-state баланс, но усложняет control plane и metadata.
- Conversion-friendly families ограничивают пространство допустимых схем, зато делают переходы дешевле и предсказуемее.
- LRC лучше для locality and repair, но не обязан быть лучшим выбором для всех cold workloads.
- Если temperature estimate шумный, система может начать oscillate между соседними state'ами.
- Если background conversion слишком агрессивен, он начнёт конкурировать с client I/O.
- Архитектура предполагает, что данные можно явно выделять в sealed stripes, которые либо переводятся в background conversion, либо остаются в текущем state.
- Если инфраструктура неоднородна по надёжности, reliability guardrail может перевесить чисто temperature-driven choice.
- Это управляемый компромисс, а не обещание универсальной оптимальности.

## Source Map
- `convertible_codes_it_2022`: формальная метрика `access cost` и lower bounds на conversion.
- `lrc_convertible_arxiv_2023`: conversion-aware LRC и сохранение locality при переходе.
- `ec_store_icdcs_2018`: latency-aware access planning и chunk movement inside EC layer.
- `heart_fast_2019`: infrastructure reliability как независимый сигнал для выбора redundancy.
- `zebra_iwqos_2016`: demand-aware tiering и multi-level EC parameter selection.
- `wide_lrc_fast_2023`: practical LRC layout, placement robustness и maintenance constraints.
- `xoring_elephants_arxiv_2013`: locality, repair cost и классический cold archival baseline.
- `ec_survey_tos_2024`: общая рамка trade-off между efficiency, performance, reliability и redundancy transitioning.
- `morph_sosp_2024`: lifecycle pipeline, hybrid redundancy и cheap first transition.
- `er_store_scientific_programming_2021`: hot / warm / cold policy и conversion table.
- `hsm_ieee_access_2024`: heat plus global disk utilization and threshold-driven switching.
- `identifying_hot_cold_icde_2013`: batch hot/cold classification и smoothing.
- `benchmarking_ec_object_storage_fgcs_2025`: метрики `upload/download/delete/waiting time`, fault tolerance и benchmark framing.
- `f4_osdi_2014`: warm tier, transparent migration и age-based temperature proxy.
- `elect_fast_2024`: hotness-aware tiering и offloading менее горячих данных.
- `rapidraid_arxiv_2012`: pipelined archival migration from replication to EC.
- `hyres_arxiv_2025`: formal hybrid redundancy model and comparison of storage cost, file loss probability and repair traffic.
