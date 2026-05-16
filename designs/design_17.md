# Design 17. NIR-aligned extent lifecycle controller

## 1. Короткая идея
Вариант фиксирует один operational mapping: `Azure-like stream/object storage` с `sealed extents` как единственной lifecycle-единицей после ingest. Архитектура строится в режиме `study-plan-driven` и целенаправленно приоритизирует `NIR-match`: многоступенчатый pipeline `R3 -> Hy -> RS -> LRC -> wide LRC`, температурная классификация + учет заполненности дисков, и безопасный протокол переходов `prepare -> verify -> metadata flip -> retire`.

## 2. Design mode
- `study-plan-driven`
- Каркас из `study-plan.md` используется буквально: `core -> policy/transitions/orchestration -> evaluation`.
- Влияние `core`-кластера: зафиксирован pipeline состояний, единицы управления, и один substrate на sealed extent уровне.
- Влияние кластера `policy/transitions/orchestration`: переходы разрешены только по явному графу adjacency; решение policy отделено от execution; задан stripe-level control protocol с rollback/cleanup.
- Влияние `evaluation`-кластера: метрики включают не только storage/latency, но и transition IO, waiting/stall, abort rate, policy stability и sensitivity по параметрам оркестрации.
- В спорных местах выбран `NIR-match`, а не novelty: сохраняется логика НИР `temperature + disk utilization + pipeline с дешёвым ранним переходом` и не вводятся дополнительные экзотические runtime-конструкции.

## 3. Учитываемый корпус
- Учтён весь корпус `conspects/*.md` (27 источников), без смены основного runtime substrate.
- Core-драйверы архитектуры: `morph_sosp_2024`, `hsm_ieee_access_2024`, `azure_ec_atc_2012`, `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`.
- Ограничения на policy и transitions: `zebra_iwqos_2016`, `rapidraid_arxiv_2012`, `tpds17_ear_2017`, `pacemaker_osdi_2020`, `tiger_osdi_2022`, `hard_jbigdata_2019`, `heart_fast_2019`, `ec_store_icdcs_2018`.
- Temperature/workload контур: `identifying_hot_cold_icde_2013`, `greenhdfs_hotpower_2010`, `janus_atc_2013`, `cbase_ec_electronics_2021`.
- System context и practical boundaries: `elect_fast_2024`, `f4_osdi_2014`, `cocytus_fast_2016`.
- Кодовые и repair-ограничения cold/deep-cold слоя: `xoring_elephants_arxiv_2013`, `wide_lrc_fast_2023`.
- Evaluation framing: `ec_survey_tos_2024`, `benchmarking_ec_object_storage_fgcs_2025`, `plank_fast_2009`.
- Из `formal-brief.md` приняты как обязательные требования: формальная temperature model, алгоритм выбора/перехода схем, архитектура decision module, и явная граница `prototype/simulator`.

## 4. Проблема и целевая постановка
- Проблема: статичная схема избыточности не держит одновременно hot-latency, storage efficiency, migration cost и safety при деградациях/ремонте.
- Цель варианта: реализуемый lifecycle-controller для гибридного хранения, который принимает решения по температуре и состоянию кластера, но исполняет переходы только через проверяемый stripe-level protocol.
- Policy unit: `SRU (Sealed Redundancy Unit)` = один sealed extent фиксированного размера.
- Execution unit: `stripe` = группа `SRU` фиксированного размера, над которой строится текущий coded layout и которая коммитится атомарно как один `generation`.
- Operational mapping ровно один: extent-level stream substrate; ELECT/f4/ER-Store/Cocytus используются только как constraints/baselines, не как альтернативные runtime substrate.

## 5. Внешний интерфейс и пользовательская модель данных
- Система предъявляется пользователю как `append-oriented object/blob storage`, а не как `key-value store` и не как интерфейс работы с `SRU` или stripe.
- Логическая пользовательская сущность: `object`.
- `object` имеет:
- `object_id`;
- пользовательские metadata;
- бинарное содержимое переменной длины;
- опциональную version/history semantics.
- Пользователь не работает с `sealed extents` напрямую; `SRU` - это только внутренняя lifecycle-unit после sealing части данных.
- Логический объект внутри интерпретируется как:
- `sealed prefix` - последовательность уже закрытых immutable extents;
- `active tail` - текущий mutable extent, в который ещё можно дописывать.
- Внешняя модель записи:
- `CreateObject(object_id, metadata)` - создать новый логический объект;
- `Append(object_id, chunk)` - дописать очередной фрагмент данных в mutable ingest path;
- `Append` не требует знания extent boundaries: если текущий `active tail` переполняется, система сама seal'ит текущий extent, создаёт следующий active extent и продолжает запись оставшейся части того же append;
- `FinalizeObject(object_id)` - завершить запись объекта; система seal'ит текущий `active tail` даже если он неполный, после чего дальнейший `Append` в этот объект запрещён;
- `WriteNewVersion(object_id, data|chunks)` - создать новую версию объекта, если нужно изменить уже записанные байты, а не просто дописать хвост;
- `Delete(object_id)` - удалить логический объект или пометить его к удалению.
- Внешняя модель чтения:
- `Read(object_id)` - прочитать весь объект;
- `ReadRange(object_id, offset, length)` - прочитать диапазон байт внутри логического объекта.
- `range` трактуется только в координатах логического объекта, а не внутренних extent/fragment identifiers:
- `offset` - смещение в байтах от начала объекта;
- `length` - сколько байт нужно вернуть;
- пользователь не обязан знать, в каких `SRU` или coded fragments лежит этот диапазон.
- User mental model:
- объект воспринимается как большой `blob` или поток данных с append/close semantics;
- данные можно писать по частям;
- система сама закрывает внутренний extent, когда он заполняется, и при необходимости открывает следующий;
- явный конец записи задаётся через `FinalizeObject`, после которого объект остаётся только для чтения;
- читать можно целиком или диапазонами;
- внутренняя смена схемы избыточности полностью прозрачна для клиента.
- Зачем нужна иммутабельность sealed части:
- она отделяет горячий mutable ingest path от дешёвого background recoding;
- упрощает stripe-level transitions, потому что уже sealed data layout не меняется во время `prepare -> verify -> metadata flip -> retire`;
- исключает необходимость делать in-place update поверх уже закодированных fragments;
- делает recovery, checksum verification и garbage collection более аудируемыми.
- Что можно и нельзя редактировать:
- `active tail` можно продолжать пополнять через `Append`;
- ранее sealed extent нельзя изменять in-place;
- изменение уже записанных байтов оформляется либо как новая версия объекта, либо как логически новый rewrite path, но не как patch поверх sealed extent.
- Граница между внешней и внутренней моделью:
- внешний API оперирует только `object_id`, metadata и byte ranges;
- внутренняя система сама отображает логический объект на mutable ingest area, затем на sealed extents (`SRU`), а дальше на coded stripes и generations.
- Эта формулировка согласуется с выбранным substrate `Azure-like stream/object storage`: пользовательская сущность - объект/blob, operational unit системы - sealed extent.

## 6. Архитектура компонентов
- `Decision engine`: вычисляет `desired_state` для каждого SRU по `heat_ewma`, `lifetime_stage`, `global_utilization`, `repair_pressure`, `reliability_band`; применяет явный приоритет сигналов: `reliability/repair veto -> temperature class -> utilization accelerator -> transition debt check`.
- `Metadata / control plane`: хранит `sru_registry`, `stripe_registry`, `transition_registry`, `policy_epoch`, `state_epoch`, `generation_id`, `pending_job`, `abort_reason`, `waiting_deadline`.
- `Storage nodes / data plane`: `replica ingest workers`, `hybrid materializer`, `RS workers`, `LRC workers`, `repair workers`; repair имеет более высокий приоритет, чем migration.
- `Temperature analysis`: batch-оценка температуры по окну `H=N/T` + EWMA smoothing + hysteresis; inline-path не нагружается.
- `Transition orchestration`: `stripe_assembler`, `placement_gate`, `budget_gate`, `commit_coordinator`, `cleanup_daemon`; протокол исполнения фиксирован как persisted state machine.

### 6.1 Metadata layer / control-plane storage
- `Metadata layer` фиксируется как отдельный `hot replicated control-plane`, физически отделённый от data/storage nodes.
- Это не blob/data storage: он хранит только маленькие strongly-consistent metadata records и transition state.
- Базовая физическая схема для v1:
- `3` metadata-узла для минимального quorum deployment или `5` metadata-узлов для более консервативного production-like профиля;
- metadata-узлы не хранят холодные data/parity fragments;
- storage nodes не являются source of truth для lifecycle metadata.
- Логическая структура metadata layer:
- `objects`:
- ключ: `object_id`;
- хранит: object-level metadata, version pointer, deletion/tombstone state, current active-tail id;
- `extents`:
- ключ: `extent_id`;
- хранит: `object_id`, logical offset range, seal status, extent size-class, checksum domain;
- `object_extent_index`:
- ключ: `(object_id, logical_offset_start)`;
- хранит: отображение логического объекта на ordered sequence extents, чтобы `ReadRange(object_id, offset, length)` резолвился без знания внутренних SRU/stripes;
- `sru_registry`:
- ключ: `sru_id`;
- хранит: `extent_id`, `state`, `desired_state`, `policy_epoch`, `state_epoch`, `generation_id`, `pending_job`, `heat_ewma`, `lifetime_stage`, `reliability_band`, `repair_pressure`;
- `stripe_registry`:
- ключ: `stripe_id`;
- хранит: список member `sru_id`, target state, current status (`open/prepare/verify/committed/aborted/retiring`), `waiting_deadline`, `abort_reason`, source/target generation ids;
- `generation_registry`:
- ключ: `generation_id`;
- хранит: committed/staging/retiring layout metadata, fragment manifests, placement version, checksum set, grace-period status;
- `transition_registry`:
- ключ: `(source_state, target_state, fragment_size_class, placement_class)`;
- хранит: admissibility rule, `stripe_width`, expected cost model, transition budget class;
- `placement_records`:
- ключ: `(generation_id, fragment_id)`;
- хранит: node/rack/fault-domain/maintenance-zone location и health binding для каждого fragment/replica.
- Сильные инварианты metadata layer:
- один `object_id` указывает максимум на один `active tail` одновременно;
- один `SRU` в один момент времени принадлежит максимум одной authoritative generation;
- authoritative `generation_id` меняется только через atomic `metadata flip`;
- partial stripe не получает committed generation;
- удаление старого layout разрешено только после committed flip и окончания grace period.
- Семантика обновлений:
- `CreateObject` создаёт запись в `objects` и initial active-tail context;
- `Append` меняет только metadata active tail и extent growth state;
- внутренний auto-seal переводит переполненный или финализируемый active extent в sealed status и создаёт соответствующий `SRU`;
- `prepare` пишет staging metadata в `stripe_registry` и `generation_registry`, не меняя authoritative mapping;
- `metadata flip` атомарно обновляет `sru_registry`, `stripe_registry`, `generation_registry` и `placement_records` на новый committed generation;
- `retire` удаляет старые placement/generation records только после grace period.
- Почему отдельный quorum metadata layer обязателен:
- без него `prepare -> verify -> metadata flip -> retire` не будет restart-safe и audit-friendly;
- lifecycle-controller должен быть able to recover after coordinator/node failure без потери authoritative truth;
- object namespace, extent mapping и redundancy state должны обновляться консистентно, а не best-effort на data nodes.
- Граница prototype/simulator:
- для целевой архитектуры metadata layer моделируется как consensus-backed logical store с атомарными transaction-like updates;
- не требуется реализовывать промышленную distributed DB, но требуется явно моделировать quorum, committed metadata state и recovery after coordinator restart.
- конкретные `MVP`-упрощения и in-memory структуры данных вынесены в [design_17_implementation.md](./design_17_implementation.md), чтобы не смешивать target architecture и first implementation step.

## 7. Data layout
- Pre-seal stage: `R3-Active` (только ingest, вне lifecycle policy).
- Первый post-seal state: `R3-Sealed` или кратко `R3`.
- Post-seal pipeline (NIR-aligned): `R3 -> Hy(1,RS(6,3)) -> RS(6,3) -> LRC(12,2,2) -> LRC(24,4,2)`.
- Примечание по NIR-нотации: соответствие примеру НИР `Hy(1, RS(6,9)) -> RS(6,9) -> LRC(12,2,2) -> LRC(24,4,2)` фиксируется как тот же смысловой pipeline с явным разделением data/parity параметров.
- `SRU` size-class: фиксированный extent class (например, 1 GiB) для v1 симулятора.
- Один `SRU` трактуется как одна fixed-size data unit; parity fragments не являются отдельными lifecycle-units и строятся поверх группы `SRU`.
- `R3` трактуется как state одного `SRU`, где payload существует в трёх полных репликах и ещё не включён в coded stripe.
- `stripe_width`: 6 SRU для `RS(6,3)`, 12 SRU для `LRC(12,2,2)`, 24 SRU для `LRC(24,4,2)`.
- Размещение: фрагменты одной stripe не коллоцируются на одном node/rack/fault-domain; для LRC local groups распределяются равномерно по maintenance zones.
- Metadata всегда на горячем replicated control-plane.

## 8. Data flow
- `ingest`: клиент пишет в `R3-Active`; после sealing создаётся `SRU` в состоянии `R3`; этот `SRU` сразу доступен для replica-first reads и не требует немедленной перекодировки.
- `first cooling step`: когда policy считает это выгодным, `stripe_assembler` набирает 6 совместимых `R3`-`SRU`; из их payload materialize'ится один `Hy(1,RS(6,3))` stripe; после `metadata flip` каждый из 6 `SRU` получает `state=Hy(1,RS(6,3))`.
- `read`: для `Hy`/`R3` путь replica-first; для `RS/LRC` systematic-read, degraded-read через decode/local-repair path.
- `update`: in-place update для SRU запрещён; новые версии уходят в новый mutable ingest path, старый SRU живёт до obsolescence/GC.
- `repair`: сначала cheapest path текущего state (replica/local/global), затем full decode; при high repair backlog новые cooling transitions блокируются.
- `migration / transition`: 
- Шаг 1: policy выставляет только `desired_state`.
- Шаг 2: stripe assembler набирает совместимый stripe по ключу `{current_state, desired_state, fragment_size_class, placement_class, policy_epoch}`.
- Шаг 3: `prepare` пишет target fragments и progress journal.
- Шаг 4: `verify` проверяет completeness/checksum/placement/budget.
- Шаг 5: `metadata flip` атомарно переключает весь stripe на новый `generation_id`.
- Шаг 6: `retire` удаляет старый layout после grace period.
- Ошибка до flip: `abort + cleanup`, authoritative layout не меняется.
- Reheating: только через `promote-copy` в более горячий layout, без in-place reverse-конверсии уже committed stripe.

## 9. Policy layer
- Temperature model: `H=N/T` на policy window + EWMA; классы `hot`, `warm`, `cold`, `deep-cold` с hysteresis.
- Scheme selection: policy выбирает только соседнее состояние из графа переходов; произвольные прыжки запрещены.
- Transition graph:
- `R3-Active (pre-seal) -> R3`
- `R3 -> Hy(1,RS(6,3))`
- `Hy(1,RS(6,3)) -> RS(6,3)`
- `RS(6,3) -> LRC(12,2,2)`
- `LRC(12,2,2) -> LRC(24,4,2)`
- `LRC(12,2,2)|LRC(24,4,2) -> promote-copy to Hy(1,RS(6,3))` (при reheating)
- `Hy(1,RS(6,3)) -> R3` допускается как самый горячий promote-step, если нужен полный возврат к pure replication.
- Transition triggers:
- cooling: 2 подряд окна ниже порога + нет veto;
- utilization accelerator: bands `<=30%`, `30-60%`, `>60%` ускоряют только один adjacent step;
- promotion: 2 окна выше hot-порога или превышение degraded-read SLA.
- Transition debt rule (NIR-priority): переход разрешён, если ожидаемая экономия в горизонте `H_eval` покрывает `prepare+network+waiting+repair-interference` debt; для `RS -> LRC` additionally проверяется порог I/O-изменения из НИР-логики.
- Safety gates:
- `reliability_gate`: downgrade запрещён вне safe band;
- `repair_gate`: downgrade запрещён при backlog выше лимита;
- `stripe_gate`: partial stripe не коммитится;
- `placement_gate`: fail при нарушении rack/fault/maintenance constraints;
- `budget_gate`: transition IO/network ограничены отдельным quota;
- `desync_gate`: при `desired_state` desync до prepare stripe пересобирается, после prepare — abort.

## 10. Метрики и план оценки
- Основные метрики (formal-brief + study-plan): `storage overhead`, `read/write latency hot path`, `degraded-read latency`, `repair traffic/time`, `transition IO`, `transition network`, `state accuracy`, `policy stability`, `fault-tolerance proxy`.
- Оркестрационные метрики: `stripe_wait_time`, `stripe_fill_rate`, `abort_rate`, `flip_retry_rate`, `cleanup_lag`, `time_in_state`, `promotion_penalty`.
- Sensitivity sweep (закрывает слабое место design_16): `stripe_width`, `waiting_window`, `fragment_size_class`, `transition_budget`, `utilization thresholds`, hysteresis width.
- Baselines:
- `3x replication only`;
- `static RS only`;
- `simple hot/cold (HSM-like) without multi-step pipeline`;
- `hybrid without orchestration gates`;
- `same pipeline but all EC transitions as full re-encode`.
- План экспериментов:
- trace replay для hot/warm/cold/deep-cold профилей;
- utilization sweep по bands;
- failure/repair storm injection;
- topology sensitivity (rack imbalance, maintenance events);
- protocol stress (desync, partial stripe, abort/retry).
- Boundary prototype/simulator:
- Реализуется `decision + control protocol prototype` и `trace-driven discrete-event extent simulator`.
- Не реализуется полнофункциональная ФС/объектное хранилище и low-level codec optimization.
- Платформа для v1: собственный simulator с Azure-like extent semantics и управляемыми failure/topology сценариями.

## 11. Trade-offs, риски, assumptions
- NIR-match выбран выше novelty: pipeline и temperature/utilization logic более консервативны, но лучше защищаемы по теме диплома.
- Один substrate снижает универсальность, но убирает неоднозначность архитектуры и усиливает инженерную проверяемость.
- `RS(6,3) -> LRC(12,2,2)` может быть дорогим; поэтому для него обязательны debt-check и budget/throttling gates.
- Multi-step lifecycle повышает сложность metadata/control plane и риск stall на stripe assembly.
- Accuracy temperature model зависит от качества trace windows и smoothing.
- Assumption: policy работает batch-wise; SRU immutable после sealing; control-plane metadata надёжно реплицирована.
- Assumption: deployment поддерживает required placement diversity (fault/rack/maintenance domains).

## 12. Source map
- `morph_sosp_2024`: hybrid-first lifecycle, дешёвый ранний переход, transcode-aware pipeline.
- `hsm_ieee_access_2024`: `H=N/T`, utilization bands, hysteresis-интуиция для policy.
- `azure_ec_atc_2012`: reference substrate (sealed extents), background EC, placement по fault/upgrade domains, `prepare/verify/metadata update` инженерная логика.
- `convertible_codes_it_2022`: формальный язык conversion/access cost и ограничения выгодных переходов.
- `lrc_convertible_arxiv_2023`: ограничения locality-preserving conversion для LRC-ветки.
- `er_store_scientific_programming_2021`: periodic reclassification, metadata-driven policy, explicit update/transition split.
- `hyres_arxiv_2025`: baseline vocabulary по storage/repair/reliability trade-off.
- `zebra_iwqos_2016`: bounded migration и demand-aware tiering по нескольким классам данных.
- `rapidraid_arxiv_2012`: migration path как отдельный оптимизируемый объект.
- `tpds17_ear_2017`: placement-before-transition и topology-aware conversion cost.
- `pacemaker_osdi_2020`: `when/which/how` orchestration, transition IO cap и safety-first switching.
- `tiger_osdi_2022`: disk/reliability-state-aware gates и risk-aware adaptation.
- `hard_jbigdata_2019`: безопасное снижение replication-factor с учётом heterogeneity/locality.
- `heart_fast_2019`: reliability heterogeneity как hard signal поверх temperature.
- `ec_store_icdcs_2018`: control-plane/data-plane separation и throttled movement model.
- `identifying_hot_cold_icde_2013`: low-overhead batch hot/cold classification и smoothing.
- `greenhdfs_hotpower_2010`: двусторонняя temperature-driven migration и anti-oscillation policy patterns.
- `janus_atc_2013`: constrained optimization framing для allocation/transition decisions.
- `cbase_ec_electronics_2021`: двусторонние transitions `replicas <-> EC`, skew-aware periodic policy cycle.
- `elect_fast_2024`: group-level metadata/execution semantics для immutable units как orchestration constraint.
- `f4_osdi_2014`: warm lifecycle operational framing и separation of control/migration responsibilities.
- `cocytus_fast_2016`: metadata/data split и update-heavy risk для hybrid redundancy.
- `xoring_elephants_arxiv_2013`: repair I/O и network как первичные метрики cold-tier.
- `wide_lrc_fast_2023`: practical LRC constraints, maintenance robustness, local-group layout discipline.
- `ec_survey_tos_2024`: общая taxonomy и `redundancy transitioning` как отдельный объект оценки.
- `benchmarking_ec_object_storage_fgcs_2025`: benchmark vocabulary и форма экспериментальной отчётности.
- `plank_fast_2009`: корректная benchmark-методика EC (изоляция coding-cost от I/O-noise).
