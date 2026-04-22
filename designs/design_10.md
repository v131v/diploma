# Design 10. Benchmark-driven hybrid object storage with staged redundancy

## Short Idea
Этот вариант рассматривает дипломную систему как управляемое object storage-хранилище с несколькими режимами избыточности. Единица миграции здесь одна и та же на всём пути: целый object, а `chunks`, `replicas`, `parity` и `stripes` являются лишь внутренним представлением его текущего layout. Горячие объекты остаются на replication-first path, переходные объекты живут в hybrid `replica + EC` слое, а холодные объекты уходят в EC/LRC-слой, где стоимость восстановления и миграции заранее учитывается. Акцент этого варианта не на одном "лучшем" коде, а на связке `object temperature -> allowed layout -> conversion cost -> benchmarked cost`.

## Accent Subset
Этот вариант специально акцентирует:
- `benchmarking_ec_object_storage_fgcs_2025` - метрики object storage benchmark: `upload/download/delete/waiting time`, fault tolerance и testbed framing.
- `er_store_scientific_programming_2021` - трёхклассная `hot / warm / cold` policy и table-driven conversion between storage modes.
- `hyres_arxiv_2025` - формальная модель hybrid redundancy и trade-off между storage cost, file loss probability и repair traffic.
- `identifying_hot_cold_icde_2013` - офлайн hot/cold classification по log'ам и exponential smoothing.
- `morph_sosp_2024` - lifecycle pipeline, hybrid redundancy и дешёвый первый переход в EC.
- `xoring_elephants_arxiv_2013` - locality-aware cold layer и repair-efficient EC через LRC.

Именно этот поднабор задаёт тон варианту: не статическая EC-конфигурация, а измеримый pipeline, где выбор режима хранения и цена перехода между режимами должны быть видимыми в benchmark-метриках.

## Corpus Considered
Весь корпус `conspects/*.md` учитывается как общий контекст и как набор ограничений на допустимые design choices.

- EC-теория и границы переходов: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`.
- Hybrid storage и lifecycle management: `morph_sosp_2024`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `elect_fast_2024`, `zebra_iwqos_2016`, `hsm_ieee_access_2024`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `heart_fast_2019`.
- Temperature / demand classification и policy inputs: `identifying_hot_cold_icde_2013`, `ec_store_icdcs_2018`.
- Benchmarking и system context: `benchmarking_ec_object_storage_fgcs_2025`.

## Problem
Одна фиксированная схема избыточности не закрывает сразу три требования:
- горячие данные должны обслуживаться быстро по чтению и записи;
- холодные данные должны быть дешёвыми по storage overhead;
- переходы между схемами не должны съедать выгоду от более экономичного слоя.

Проблема становится особенно заметной в object storage, где оценивать систему только по storage savings недостаточно. `Benchmarking...` показывает, что здесь важны `upload/download/delete/waiting time`, а `Morph`, `ER-Store` и `Convertible Codes` напоминают, что сама смена схемы хранения имеет цену по I/O и сети. Поэтому архитектура должна управлять не только steady-state размещением, но и стоимостью перехода между состояниями.

## Architecture Components
Архитектура строится как control plane поверх object storage data plane.

- `Telemetry collector` собирает access history, object age, read/write intensity, space pressure, repair backlog и сигналы надёжности fault domains.
- `Hotness classifier` переводит историю обращений в hot / warm / cold classes, используя batch update и smoothing вместо критического пути чтения.
- `Policy engine` работает как state machine на уровне object и выбирает только допустимые next states из заранее заданного графа переходов.
- `Conversion planner` подбирает конкретный переход между допустимыми layout states и проверяет, можно ли выполнить его как cheap conversion без смены object partitioning; если нет, он помечается как full re-encode.
- `Layout manager` раскладывает object-local chunks, parity и replicas по fault domains и удерживает locality там, где repair traffic важен.
- `Repair and recovery service` обслуживает degraded reads, rebuild и восстановление после отказов.
- `Benchmark harness` измеряет поведение системы на одинаковых data sets и в одинаковом testbed, чтобы политика не "верила себе" без проверки.
- `Metadata service` хранит текущий режим объекта, состояние transition, последний decision reason и допустимые next states.

## Data Layout
Базовый layout организован как четыре режима, но миграция всегда происходит на уровне целого object.

- `Hot tier`: 3-way replication для объектов с высокой частотой доступа и чувствительным write path.
- `Warm tier`: гибридный слой `replica + EC`, где replication даёт быстрый критический путь, а EC уже готовит экономичный переход дальше.
- `Cold tier`: EC-слой на RS- или convertible-friendly конфигурациях, когда storage efficiency важнее latency.
- `Deep cold tier`: optional LRC-слой, если repair traffic и locality-aware recovery важнее простого EC.

Правила гранулярности:
- object is the migration unit; `chunks`, `replicas`, `parity` и `stripes` не мигрируют независимо друг от друга;
- один object имеет один active layout state и, при переходе, один background target state;
- если candidate transition требует изменить chunking или fault-domain partitioning, это уже не cheap conversion, а full re-encode;
- layout family для объекта выбирается заранее и не меняется произвольно на каждом шаге.

Layout-ограничения:
- data и parity должны лежать в разных fault domains;
- locality для cold/deep-cold объектов не должна теряться без причины;
- metadata о текущем состоянии объекта хранится отдельно от object data chunks;
- target code family выбирается из заранее допустимого набора, а не "на глаз";
- transition-ready objects переводятся асинхронно, чтобы не блокировать client path.

## Data Flow
Поток данных устроен как явный граф переходов между layout states одного object.

1. Новый object попадает в `Hot / R3` state и получает replication-first placement.
2. Логи обращений накапливаются отдельно от критического пути.
3. Hotness classifier периодически обновляет класс объекта по сглаженной истории доступа.
4. Если объект остывает, background transition переводит его в `Warm / H` state.
5. Когда объект стабилизируется в низкой частоте доступа, система переводит его в `Cold / EC` state.
6. Если для cold layer важнее repair efficiency и locality-aware recovery, `Cold / EC` может перейти в `Deep cold / LRC`.
7. Reverse transition разрешён только по соседнему ребру графа: `Deep cold / LRC -> Cold / EC`, `Cold / EC -> Warm / H`, `Warm / H -> Hot / R3`.
8. Переход через две ступени или больше выполняется как цепочка соседних переходов; если layout-family registry не позволяет цепочку без смены chunking, conversion planner выбирает full re-encode.
9. Read path для hot data идёт через replicas, а cold data читаются через EC/LRC reconstruction только при необходимости.
10. Repair и migration выполняются отдельно от client critical path, чтобы не смешивать их с обычным I/O.

## Policy Layer
Policy layer здесь не бинарный и не сводится к одному порогу.

- Температура данных оценивается по history of accesses на фиксированном окне, как в `Identifying Hot and Cold Data`.
- Для объектов с сильно разным спросом допустимы несколько классов, а не только `hot/cold`.
- Global space pressure остаётся вторым управляющим сигналом, но он работает только внутри множества reliability-feasible states.
- Reliability state конкретных fault domains формируется из telemetry inputs: recent failures, degraded-read rate, repair backlog и imbalance между domains.
- Если reliability guardrail запрещает candidate state, policy engine не компенсирует это space pressure.
- `Conversion cost` и `repair cost` проверяются явно; transition разрешается только если ожидаемая экономия в decision window выше стоимости конверсии и repair penalty.
- Hysteresis нужен, чтобы система не дёргалась между режимами на шумных traces; новый state commit допускается только после подтверждения в двух consecutive evaluation windows.
- `Code family registry` ограничивает search space до заранее допустимых edges графа и не позволяет policy перепрыгивать через layout family без полного re-encode.

Правило решения:
- сначала отбрасываются states, которые нарушают reliability guardrail или layout-family restriction;
- затем сравниваются admissible states по projected total cost, где учитываются storage overhead, access cost, transition IO, transition network traffic и repair cost;
- policy выбирает state только если он лучше текущего состояния на заданный margin и не противоречит hysteresis;
- если несколько соседних переходов дают одинаковый эффект, выбирается более короткая цепочка.

## Metrics / Evaluation Plan
Оценка должна смотреть не только на storage savings, но и на поведение transition path.

- `upload time`, `download time`, `delete time` и `waiting time` по объектным операциям;
- `fault tolerance`, `probability of data loss` и `repair efficiency`;
- `storage overhead` по tier'ам и по всей системе;
- `read latency` и `tail latency` для hot и cold data;
- `write latency` и влияние на ingest path;
- `transition IO` и `transition network traffic`;
- `repair traffic`, `degraded-read latency` и `recovery time`;
- `policy stability`, то есть частота лишних переключений и чувствительность к окну оценки.

План сравнения:
- против `3-way replication`;
- против static RS;
- против static LRC;
- против hot/cold split без multi-step pipeline;
- против hybrid storage без explicit conversion-cost model.

Workload suite:
- `Trace replay`: replay access logs, собранные самим telemetry collector в testbed, на одном и том же наборе objects;
- `Lifecycle replay`: искусственно сгенерированная последовательность hot -> warm -> cold, основанная на тех же access traces и фиксированной доле hot/warm/cold объектов;
- `Transition stress`: отдельные прогоны для каждого edge графа, чтобы измерять `R3 -> H`, `H -> EC`, `EC -> LRC` и reverse edges по отдельности;
- `Fault injection`: один injected fault domain failure во время background conversion, чтобы измерить degraded-read latency и recovery time;
- `Size buckets`: один и тот же набор object-size buckets используется во всех прогонах, чтобы transition IO и network traffic были сопоставимы между сценариями.

Protocol:
- каждый сценарий запускается на фиксированном object set;
- classifier warm-up выполняется до измерения, а сама оценка начинается после стабилизации decision window;
- для каждого edge записываются transition IO, transition network traffic, elapsed time и resulting state;
- replay и fault injection выполняются отдельно, чтобы не смешивать steady-state latency с conversion cost.

## Trade-offs / Risks / Assumptions
- Более гибкий pipeline улучшает баланс между latency и storage, но усложняет control plane и metadata.
- Hybrid warm tier добавляет промежуточное состояние, зато снижает шанс дорогого "скачка" сразу из replication в cold EC.
- LRC лучше для locality and repair, но не обязан быть лучшим выбором для всех cold workloads; поэтому deep cold tier остаётся optional, а не базовым обязательством.
- Если hotness estimate шумный, система может начать oscillate между соседними states.
- Если background conversion слишком агрессивен, он начнёт конкурировать с клиентским I/O.
- Архитектура предполагает, что объекты можно явно выделять в transition-eligible units, и именно object остаётся такой единицей.
- Для object storage мы переносим tablet/file-life-cycle идеи из базовых работ как архитектурную аналогию, а не как буквальное совпадение granularity.
- Если инфраструктура неоднородна по надёжности, reliability guardrail перевешивает чисто temperature-driven choice и может запретить переход, даже когда space pressure высокий.

## Source Map
- `benchmarking_ec_object_storage_fgcs_2025`: задаёт evaluation vocabulary и object-storage testbed framing.
- `er_store_scientific_programming_2021`: даёт `hot / warm / cold` policy и таблицу конверсии схем.
- `hyres_arxiv_2025`: формализует hybrid redundancy и trade-off между storage cost, file loss probability и repair traffic.
- `identifying_hot_cold_icde_2013`: даёт batch hot/cold classification и smoothing как способ не тащить классификацию в критический путь.
- `morph_sosp_2024`: показывает lifecycle pipeline, hybrid redundancy и cheap first transition to EC.
- `xoring_elephants_arxiv_2013`: задаёт repair-efficient cold layer через locality-aware EC и LRC.

Supportive corpus constraints:
- `ec_survey_tos_2024`: напоминает, что нельзя смотреть только на storage efficiency и надо учитывать transitions.
- `convertible_codes_it_2022`: даёт `access cost` как формальную основу для EC-to-EC transitions.
- `lrc_convertible_arxiv_2023`: показывает, как сохранить locality при conversion.
- `wide_lrc_fast_2023` и `azure_ec_atc_2012`: удерживают cold layer в рамках практичных LRC/EC design choices.
- `zebra_iwqos_2016`: поддерживает многоуровневую tier-логику вместо грубого бинарного split.
- `elect_fast_2024`: показывает, что selective encoding/offloading по hotness можно встраивать в уже существующий storage stack.
- `hsm_ieee_access_2024`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `heart_fast_2019`, `ec_store_icdcs_2018`: задают ограничения на temperature inputs, warm-tier thinking, archival migration и latency-aware placement.
