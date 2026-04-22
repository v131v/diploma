# Design 07. Object-storage warm buffer with cheap hybrid transitions

## Short Idea
Не одна схема хранения для всех объектов, а object-storage pipeline из трех состояний: hot objects остаются в replication-friendly виде, warm objects живут в hybrid redundancy, cold objects переводятся в EC/LRC layout. Главный акцент варианта - измеряемая температура, прозрачная миграция и минимизация цены переходов между состояниями.

## Accent Subset
Этот вариант специально акцентирует:
- `benchmarking_ec_object_storage_fgcs_2025`
- `f4_osdi_2014`
- `hsm_ieee_access_2024`
- `hyres_arxiv_2025`
- `identifying_hot_cold_icde_2013`
- `morph_sosp_2024`

Именно этот поднабор задает тон варианту: object-storage benchmarkability, warm tier как отдельный слой, heat + disk utilization как управляющие сигналы, формальная цена гибридной избыточности и дешевые transcode-переходы.

## Corpus Considered
Весь корпус `conspects/*.md` используется как ограничитель архитектурных решений, а не только как набор цитат для related work.

- `ec_survey_tos_2024` задает базовый trade-off между storage efficiency, performance, reliability и redundancy transitioning.
- `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`, `wide_lrc_fast_2023`, `convertible_codes_it_2022` и `lrc_convertible_arxiv_2023` ограничивают выбор cold-tier кодов, repair cost и стоимости конверсии.
- `er_store_scientific_programming_2021`, `zebra_iwqos_2016` и `elect_fast_2024` задают язык workload-aware и tier-aware policy.
- `rapidraid_arxiv_2012` и `ec_store_icdcs_2018` показывают, что migration и access planning сами по себе являются системной стоимостью.
- `heart_fast_2019` добавляет инфраструктурную надежность как отдельный сигнал.
- `f4_osdi_2014`, `hsm_ieee_access_2024`, `hyres_arxiv_2025`, `identifying_hot_cold_icde_2013` и `morph_sosp_2024` образуют основной каркас этого варианта.
- `benchmarking_ec_object_storage_fgcs_2025` фиксирует набор метрик и testbed-подход для оценки object-storage EC.

## Problem
Проблема дипломной системы состоит не только в том, чтобы хранить объекты дешево, а в том, чтобы делать это при меняющейся температуре, ограниченной сети, неоднородной надежности дисков и дорогих переходах между схемами.

Статика плохо работает в обе стороны:
- pure replication слишком дорога для холодных объектов;
- pure EC обычно тяжелее для hot path и сложнее для миграции;
- грубое `hot/cold` деление не учитывает глобальную заполненность дисков и цену переключения;
- один cold-tier code не универсален, потому что repair profile и layout constraints у объектов различаются.

## Architecture Components
### 1. Ingest gateway and hot tier
- Новые объекты сначала попадают в hot tier в replication-friendly виде.
- Hot tier сохраняет low-latency writes и быстрое чтение для объектов с высоким спросом.
- Такой слой соответствует production-логике warm/hot separation из `f4`.

### 2. Temperature profiler
- Слой профилирования собирает access logs, age, read/delete counts и сглаженные оценки частоты.
- Для определения hot/cold можно опираться на offline-style classification из `Identifying Hot and Cold Data`.
- Этот слой не принимает финального решения о migration, а только поставляет сигналы policy layer.

### 3. Utilization monitor
- Монитор следит за global disk space utilization как в `HSM`.
- Заполнение дисков влияет не только на cold storage choice, но и на то, когда система должна раньше переводить объекты в более экономичный режим.

### 4. Policy and controller plane
- Controller совмещает heat, global utilization, conversion cost, repair cost и reliability state.
- Policy layer решает, оставлять ли объект на replication, переводить ли его в warm hybrid mode или отправлять в cold EC/LRC.
- Решения принимаются по cost comparison и порогам, а не по одной бинарной метке.

### 5. Conversion planner
- Отвечает за cheap transition между redundancy states.
- Для replication -> hybrid -> EC использует идею `Morph`: первый переход должен быть максимально дешёвым, а дальнейшие transcode-переходы должны избегать полного `read - re-encode - write`.
- Для EC -> EC planner должен выбирать только такие пары схем, где convertible path экономит I/O.

### 6. Warm storage subsystem
- Warm слой хранит объекты, которые уже не hot, но ещё слишком ценны для полного cold archival.
- Он нужен как буфер между hot replication и cold EC, как в `f4`.
- Здесь особенно важна прозрачная миграция, чтобы клиентский путь не менялся при смене схемы хранения.

### 7. Cold storage engine
- Cold слой хранит sealed objects в EC/LRC layout.
- Для предсказуемого archival можно использовать RS.
- Для repair-sensitive объектов лучше подходят LRC-like layouts и wide LRC.

### 8. Metadata and fault-domain manager
- Метаданные о температуре, схеме хранения, conversion state и fault domains живут отдельно от data plane.
- Layout не должен класть fragments одного object stripe в один fault domain.
- Для reliability-aware decisions учитывается состояние disk groups и rack placement.

## Data Layout
Предлагаемый layout трехслойный и object-centric.

- `Hot tier`: 3-way replication на быстрых узлах или стойках.
- `Warm tier`: hybrid redundancy, где объект существует в виде `replica + EC stripe`.
- `Cold tier`: EC/LRC stripes для sealed objects, причем код выбирается по repair profile и стоимости миграции.

Размещение должно быть rack-aware и fault-domain-aware:
- hot objects хранятся ближе к запросам;
- transition placement старается минимизировать cross-rack traffic;
- cold stripes раскладываются так, чтобы local repair не требовал чтения всего stripe.

## Data Flow
1. Объект приходит в hot tier в replication-friendly формате.
2. Temperature profiler строит сглаженную оценку hotness по логам обращений.
3. Utilization monitor обновляет сигнал о глобальной заполненности дисков.
4. Policy layer классифицирует объект как hot, warm или cold.
5. Conversion planner выбирает конкретный путь миграции.
6. Если объект переходит в warm, replica component сохраняется как буфер, а EC stripe готовится параллельно.
7. Если объект cold и sealed, planner выполняет EC/LRC conversion через cheap access-cost path.
8. После migration metadata обновляется, а router or gateway продолжает скрывать смену внутреннего layout.
9. Repair path использует локальные parity, если они доступны, и фоновую rebuild-логику для полного восстановления.

## Policy Layer
Policy layer здесь объединяет несколько сигналов:

- `heat`: частота обращений по окну времени;
- `temperature estimate`: сглаженная оценка hotness по истории access logs;
- `global disk utilization`: общий запас диска, как в `HSM`;
- `conversion cost`: стоимость read/write access при переходе, как в `Morph`;
- `repair cost`: bandwidth и I/O cost восстановления, как в survey, `HyRES` и LRC-related works;
- `reliability state`: состояние disk groups и rack domains.

Рабочая логика policy:
- горячие объекты остаются на replication;
- объекты с падающим спросом переходят в warm hybrid mode;
- sealed cold objects переводятся в EC/LRC только если ожидаемая экономия превышает migration cost;
- при высокой заполненности дисков policy становится более aggressive toward EC;
- при плохой надежности конкретной группы disks policy может задержать переход или выбрать более robust layout;
- чтобы избежать oscillation, policy должна использовать hysteresis или cooldown window.

## Metrics / Evaluation Plan
Метрики надо мерить не по одной оси, а по нескольким, иначе вариант не получится честно сравнить.

- storage overhead;
- effective replication factor;
- upload latency;
- download latency;
- delete latency;
- waiting time;
- read latency для hot/warm/cold объектов;
- write latency на ingest path;
- conversion cost в I/O и network traffic;
- repair traffic и degraded-read cost;
- recovery time after failure;
- доля объектов, попавших в правильную температурную зону;
- sensitivity к skewed workload, fragment size и disk utilization.

План оценки:
- использовать synthetic access traces и object-oriented workload mixes;
- отдельно сравнить hot-only replication, static RS, binary hot/cold, hybrid without pipeline и proposed pipeline;
- проверить, когда replication -> warm -> EC transition окупается;
- сравнить RS и LRC cold layouts по repair traffic и degraded reads;
- прогнать сценарии с разной заполненностью дисков, разным skew и разными failure domains;
- использовать benchmark-рамку из `benchmarking_ec_object_storage_fgcs_2025` как базу для testbed и метрик.

## Trade-offs / Risks / Assumptions
- Более точная temperature policy требует больше telemetry и сложнее control loop.
- Warm tier временно увеличивает storage overhead, но он нужен как буфер между быстрым ingest и дешёвым archival.
- Cheap transitions возможны не для любой пары кодов; поэтому нужно заранее ограничивать допустимые next states.
- Wide LRC и locality-friendly layouts усложняют placement, но снижают repair cost.
- Если observation window слишком короткое, policy начнет дергаться; если слишком длинное, она запоздает.
- Предполагается, что объекты можно явно выделять в sealed/aged units; это хорошо согласуется с `f4`, `Morph` и `Identifying Hot and Cold Data`, но требует адаптации под конкретный backend.
- Архитектура не обещает универсальную оптимальность: это управляемый компромисс между latency, storage efficiency, migration cost и reliability.

## Source Map
- `benchmarking_ec_object_storage_fgcs_2025`: metrics and benchmark design for upload/download/delete/waiting time, fault tolerance and fragment size.
- `f4_osdi_2014`: warm BLOB storage, transparent migration through router tier, and production justification of a warm layer.
- `hsm_ieee_access_2024`: heat plus global disk utilization, threshold-driven switching and rack-aware placement.
- `hyres_arxiv_2025`: formal hybrid redundancy model and comparison of storage cost, file loss probability and repair traffic.
- `identifying_hot_cold_icde_2013`: offline hot/cold classification from access logs with exponential smoothing.
- `morph_sosp_2024`: hybrid redundancy, free transcode to EC, and native lifecycle transitions.
- `ec_survey_tos_2024`: overall EC trade-off map and the place of redundancy transitioning in the field.
- `azure_ec_atc_2012`: production RS context, fault domains and the practical baseline for EC layouts.
- `xoring_elephants_arxiv_2013`: locality, repair cost and the classical reasons why EC is not just about storage savings.
- `wide_lrc_fast_2023`: practical LRC layout and repair-efficiency constraints.
- `convertible_codes_it_2022` and `lrc_convertible_arxiv_2023`: the theory of cheaper EC-to-EC conversion and conversion with locality.
- `er_store_scientific_programming_2021`: earlier hybrid temperature-aware storage as a related design point.
- `zebra_iwqos_2016` and `elect_fast_2024`: demand-aware and hotness-aware tiering as policy references.
- `rapidraid_arxiv_2012` and `ec_store_icdcs_2018`: migration cost and access planning as first-class system concerns.
- `heart_fast_2019`: infrastructure reliability as an independent signal for redundancy choice.
