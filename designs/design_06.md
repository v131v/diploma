# Design 06. Temperature-aware lifecycle pipeline with cheap transitions

## Short Idea
Не одна схема для всех данных, а управляемый file-lifecycle pipeline: новые sealed files живут на replication, затем проходят в warm hybrid state, а холодные файлы переводятся в repair-efficient EC/LRC. Главный акцент варианта - не только выбор конечной схемы, но и цена переходов между состояниями.

## Accent Subset
Этот вариант специально акцентирует:
- `benchmarking_ec_object_storage_fgcs_2025`
- `ec_survey_tos_2024`
- `er_store_scientific_programming_2021`
- `f4_osdi_2014`
- `rapidraid_arxiv_2012`
- `xoring_elephants_arxiv_2013`

Именно этот поднабор задает тон варианту: измеримость, warm-tier как отдельный слой, cheap replication -> EC migration и repair-efficient cold tier.

## Corpus Considered
Весь корпус `conspects/*.md` используется как ограничитель и источник design choices, а не только как набор цитат для related work.

- Этот вариант фиксирует один канонический substrate: sealed immutable files. `ER-Store` и `ELECT` используются только как policy analogs на tablet/SSTable substrates, а не как выбранная data model.
- `HSM` добавляет второй управляющий сигнал: не только heat, но и global disk space utilization, плюс hysteresis-style switching.
- `Morph`, `Convertible Codes` и `LRC Convertible` задают язык дешевых transitions между redundancy states.
- `f4` и `benchmarking_ec_object_storage_fgcs_2025` подтверждают практику warm tier для immutable units и дают проверяемые метрики для migration cost.
- `Azure EC`, `XORing Elephants`, `Wide LRC` и `RapidRAID` ограничивают cold tier по repair cost, locality и migration cost.
- `HeART` добавляет инфраструктурную надежность как вторую ось решения.
- `Identifying Hot and Cold Data` дает практический способ считать температуру по логам обращений.
- `HyRES` и survey paper фиксируют формальные trade-off между replication, EC and hybrid schemes.

## Problem
Проблема дипломной системы - не просто хранить данные дешево, а делать это при меняющейся температуре, ограниченной сети, неоднородной надежности дисков и дорогих переходах между схемами.

Статика плохо работает в обе стороны:
- pure replication слишком дорога для холодных данных;
- pure EC слишком тяжела для hot data и дорогих миграций;
- грубое `hot/cold` деление не учитывает заполненность дисков, degradation cost и цену conversion;
- один cold-tier code тоже не универсален: для разных layout и repair целей нужны разные параметры и иногда разные code families.

## Architecture Components
### 1. Canonical substrate and migration unit
- В этом варианте есть одна базовая единица управления: sealed immutable file.
- Observer, policy, transition planner и metadata manager работают на уровне file, а не на уровне tablet, SSTable, blob или disk group.
- Источники с другой гранулярностью используются как analogs, чтобы подсветить policy или conversion logic, но не меняют data model этой архитектуры.

### 2. Temperature observer
- Слой наблюдения собирает access logs, age, read/write/delete counts, utilization signals и reliability state.
- Температура считается на окне наблюдения и сглаживается, чтобы не реагировать на краткие всплески.
- Этот слой не принимает финального решения о migration, а только поставляет сигналы policy layer.

### 3. Policy and controller plane
- Controller совмещает heat, global disk utilization, repair cost и reliability state.
- Policy layer решает, оставлять ли file на replication, переводить ли его в hybrid warm state или отправлять в cold EC/LRC.
- Решения принимаются по hysteresis rules и cost comparison, а не по одной бинарной метке.

### 4. Conversion planner
- Отвечает за cheap transition между adjacent redundancy states.
- Для replication -> hybrid -> EC использует lifecycle ideas из `Morph`; первый переход должен быть максимально дешёвым, а дальнейшие transitions не должны превращаться в full read-reencode-write.
- Для EC -> EC использует convertible codes, чтобы не делать full read-reencode-write.
- `RapidRAID` используется только как distributed encoding path внутри archival migration, а не как policy engine.

### 5. Cold storage engine
- Хранит sealed files в EC/LRC layout.
- Для простого archival используется RS-режим.
- Для repair-sensitive files предпочтителен wide LRC or LRC-like layout с локальными группами и maintenance-zone-aware placement.

### 6. Metadata and fault-domain manager
- Метаданные о temperature state, scheme state, conversion state и fault domains живут отдельно от data plane.
- Layout не должен класть fragments одного stripe в один fault domain.
- Для reliability-aware decisions учитывается состояние disk groups и maintenance zones, а не только температура данных.

## Data Layout
Предлагаемый layout трехслойный.

- `Hot tier`: 3-way replication на быстрых узлах/стойках.
- `Warm tier`: гибридный слой `replica + EC`, где replication еще сохраняет access performance, а EC уже снижает storage overhead.
- `Cold tier`: EC/LRC stripes для sealed files, причем code family выбирается по repair profile:
  - RS, если нужен простой и предсказуемый archival;
  - wide LRC, если важны degraded-read cost, repair traffic и maintenance robustness;
  - LRC-convertible-friendly layout, если ожидается следующий EC-to-EC transition и хочется сохранить cheap conversion path.

Размещение должно быть rack-aware и fault-domain-aware:
- primary placement у hot data остается ближе к нагрузке;
- transition placement старается минимизировать cross-rack traffic;
- cold stripes раскладываются так, чтобы local repairs не требовали чтения всего stripe.

## Data Flow
1. File enters hot tier in replication-friendly format.
2. Observer collects access history, utilization signals and reliability state.
3. Policy layer classifies file as hot, warm or cold using hysteresis thresholds.
4. Conversion planner выбирает конкретный adjacent transition.
5. If a warm transition is chosen, replica component is preserved as the front-facing copy while EC stripe is prepared in background.
6. If a cold transition is chosen, planner делает EC/LRC conversion через cheap access-cost path.
7. After migration metadata updates, and the data plane releases old copies/fragments only after the new state is committed.
8. Repair path uses local parity when available and background rebuild logic for full recovery.
9. If the requested target is more than one state away, the planner decomposes it into adjacent steps instead of jumping directly.

## Policy Layer
Policy layer здесь не сводится к одной формуле. Он объединяет несколько сигналов:

- `heat`: частота обращений по окну времени;
- `disk utilization`: глобальная заполненность, как в `HSM`;
- `demand skew`: неравномерность спроса, как в `Zebra`;
- `conversion cost`: стоимость read/write access при переходе, как в `Convertible Codes` и `LRC Convertible`;
- `repair cost`: network and I/O cost восстановления, как в `XORing Elephants` и `wide LRC`;
- `infrastructure reliability`: состояние disk groups, как в `HeART`.

Рабочая логика policy:
- hot state is retained while `heat` stays above the enter-hot threshold or while the file is still active for writes;
- hot -> warm happens only after `heat` stays below the exit-hot threshold for one observation window and `expected savings - migration cost > 0`;
- warm -> hot happens when `heat` rises above the enter-hot threshold again, which is the return transition for renewed demand;
- warm -> cold happens only for sealed files and only if `expected savings - migration cost > 0`;
- cold -> warm happens when demand revives and the file again crosses the warm exit/enter band;
- cold RS -> cold LRC happens only if RS repair traffic or degraded-read cost is above the bound that the current failure model can tolerate and maintenance-zone placement is satisfiable;
- if global utilization is low, the controller is conservative; if utilization is high, it becomes more aggressive toward the colder state for files that are already sealed;
- the controller changes only one step per decision epoch, so a multi-step request is decomposed into adjacent transitions.

## Metrics and Evaluation Plan
Метрики надо мерить не по одной оси, а по нескольким, иначе вариант не получится честно сравнить.

- storage overhead;
- read latency для hot/warm/cold;
- write latency на ingest path;
- conversion cost в I/O and network traffic;
- repair traffic и degraded-read cost;
- recovery time после отказа;
- cross-rack traffic при migration;
- доля данных, попавших в правильную температурную зону;
- sensitivity к disk utilization и skewed workload;
- durability / reliability under failure scenarios.

План оценки:
- использовать synthetic temperature traces, skewed access patterns и explicit cooling/reheating cycles;
- отдельно сравнить hot-only, cold-only, hybrid without pipeline и proposed pipeline;
- проверить effect of conversion path на total traffic;
- измерить, когда replication -> warm -> EC transition окупается;
- сравнить RS и LRC cold layouts по repair traffic, degraded reads и maintenance-robustness;
- прогнать сценарии с разной заполненностью дисков и разной надежностью групп;
- отдельно измерить state oscillation rate, чтобы проверить hysteresis rules.

## Trade-offs, Risks, Assumptions
- Более точная temperature policy требует больше telemetry и сложнее control loop.
- Hybrid warm tier может временно увеличить storage overhead, но он нужен как буфер между быстрым ingest и дешёвым archival.
- Cheap transitions возможны не для любой пары кодов; поэтому нужно заранее ограничить допустимые next states.
- Wide LRC и locality-friendly layouts усложняют placement, но снижают repair cost.
- RS дешевле и проще как archival default, но может уступать LRC по repair traffic и degraded-read cost.
- Если temperature window слишком короткое, policy начнет дергаться; если слишком длинное, она запоздает.
- Предполагается, что files можно явно выделять в sealed/aged units; это хорошо согласуется с `f4`, `Morph` и `RapidRAID`, а `ER-Store` и `ELECT` здесь выступают только как policy analogs.
- Архитектура не обещает универсальную оптимальность: это управляемый компромисс между latency, storage efficiency, migration cost и reliability.

## Source Map
- `ec_survey_tos_2024`: общая рамка trade-off между storage efficiency, performance и reliability, плюс понятие redundancy transitioning.
- `benchmarking_ec_object_storage_fgcs_2025`: метрики оценки для immutable object-like workloads, включая upload/download/delete, waiting time и fault tolerance.
- `er_store_scientific_programming_2021`: трехстадийная temperature-aware policy `hot/warm/cold`, periodic conversion table и split update path на tablet-level substrate; здесь это policy analog only.
- `f4_osdi_2014`: production warm tier, transparent migration через router tier и layered hot/warm storage for immutable BLOBs.
- `rapidraid_arxiv_2012`: pipelined replication-to-EC archival, когда migration itself становится отдельным bottleneck; used only for the archival encoding path.
- `xoring_elephants_arxiv_2013`: locality, repair traffic, degraded reads и смысл repair-efficient EC.
- `hsm_ieee_access_2024`: heat + global disk utilization, hysteresis-style switching и rack-aware placement.
- `morph_sosp_2024`: lifecycle pipeline, hybrid redundancy и дешёвые transitions между redundancy states.
- `convertible_codes_it_2022`: формальная метрика access cost для EC-to-EC conversion.
- `lrc_convertible_arxiv_2023`: conversion with locality, если cold tier строится на LRC и нужно сохранить cheap next-step transitions.
- `azure_ec_atc_2012`: production EC write/repair path, sealed extents и placement across fault domains.
- `ec_store_icdcs_2018`: latency-aware access planning и chunk movement внутри EC-слоя.
- `elect_fast_2024`: SSTable-level hotness-aware redundancy transitioning и выборочный перевод в EC; policy analog only, not the chosen substrate.
- `zebra_iwqos_2016`: demand-aware tiers и многослойная политика вместо one-size-fits-all EC.
- `hyres_arxiv_2025`: формальная модель гибридной избыточности и сравнение replication, EC и hybrid schemes.
- `wide_lrc_fast_2023`: practical wide-LRC layout, maintenance zones и robustness на реальных failure patterns.
- `identifying_hot_cold_icde_2013`: batch temperature classification по логам обращений и exponential smoothing.
- `heart_fast_2019`: инфраструктурная надежность как второй control signal при выборе redundancy scheme.
