# Лестница гибридного хранения по спросу

## 1. Короткая идея
Система хранит горячие данные в репликах, переводит менее горячие в промежуточную гибридную схему, а холодные - в repair-efficient EC/LRC. Основной control substrate здесь один: `object-version`; `stripe` используется только как физический формат холодного слоя. Политика работает как периодический state machine по сглаженному спросу, температуре данных и глобальной заполненности дисков, а стоимость переходов ограничивается layout-ом и conversion-aware правилами.

## 2. Accent subset
- `azure_ec_atc_2012`: задаёт холодный baseline с LRC, cheap reconstruction и placement across fault/upgrade domains.
- `ec_survey_tos_2024`: даёт общую карту trade-off'ов storage, performance, reliability и transition cost.
- `er_store_scientific_programming_2021`: фиксирует hot/warm/cold policy и периодическую конверсию как control pattern.
- `hyres_arxiv_2025`: формализует hybrid redundancy и cost model для storage cost, file loss probability и repair traffic.
- `xoring_elephants_arxiv_2013`: показывает, что repair I/O и network traffic должны быть first-class metrics.
- `zebra_iwqos_2016`: задаёт demand-aware multi-tiering и привязку EC-параметров к спросу.

## 3. Учитываемый корпус
- `hsm_ieee_access_2024`: добавляет глобальную заполненность дисков и hysteresis, чтобы policy не застревала в бинарном hot/cold правиле.
- `morph_sosp_2024`: напоминает, что transitions сами по себе должны проектироваться как часть storage system.
- `convertible_codes_it_2022` и `lrc_convertible_arxiv_2023`: дают формальную цену EC-to-EC conversion и ограничения по locality.
- `ec_store_icdcs_2018`: поддерживает latency-aware access planning внутри EC-слоя.
- `elect_fast_2024`: показывает hotness-aware tiering в LSM-tree и выборочное переключение replication -> EC.
- `identifying_hot_cold_icde_2013`: даёт practical temperature metric по журналам обращений и smoothing.
- `f4_osdi_2014`: задаёт production-контекст warm tier и age/request-rate proxy для температуры.
- `heart_fast_2019`: добавляет сигнал состояния инфраструктуры как возможное расширение policy.
- `rapidraid_arxiv_2012`: поддерживает архивный путь от replication к EC для охлаждённых данных.
- `wide_lrc_fast_2023`: добавляет требования к layout и robustness для широкого cold LRC-слоя.
- `benchmarking_ec_object_storage_fgcs_2025`: задаёт набор метрик для оценки object-storage EC.

## 4. Проблема и целевая постановка
- Проблема здесь не в выборе одной «лучшей» схемы, а в том, как системно управлять сменой схем хранения в зависимости от поведения данных и состояния кластера.
- Простое правило `hot = replication, cold = EC` слишком грубо: оно игнорирует промежуточные состояния, стоимость миграции, repair traffic и давление по заполненности дисков.
- Целевая постановка - policy-driven storage stack на уровне `object-version`, где control plane выбирает схему хранения и следующий шаг миграции, а data plane исполняет это без потери корректности и без лишней нагрузки на клиентский путь.
- В этой версии design file не смешивает substrate уровни: `object-version` - единица решения, `stripe` - только физическая раскладка для cold EC/LRC, а file/tablet примеры из корпуса используются лишь как источник сигнала, cadence или transition pattern.
- Это синтез, а не пересказ одной работы: из ER-Store, Zebra, HSM, Morph и HyRES следует, что policy, conversion cost и layout нужно проектировать вместе, но без смешения их domain granularity.

## 5. Архитектура компонентов
- `Telemetry collector`: собирает access frequency, age, delete rate, disk utilization, repair history и load hotspots на уровне `object-version`.
- `Temperature analyzer`: считает сглаженную температуру `object-version` и переводит её в tier score; file/tablet proxy из корпуса используются только как источник формы сигнала, а не как substrate.
- `Policy engine`: работает как state machine и выбирает между `replication`, `hybrid staging` и `EC/LRC` на основе score, utilization, estimated conversion cost и hysteresis band.
- `Metadata/control plane`: хранит scheme tag, current state, target state, layout version, migration phase, guard timers и repair group mapping.
- `Transition orchestrator`: запускает background migration, throttling, rollback-safe metadata update и staged conversion через промежуточный warm state; завершает переход только после validation of target layout.
- `Storage nodes/data plane`: хранят replicas, parity fragments и local groups, а также выполняют encode, decode, repair и rebuild.
- `Placement manager`: раскладывает replicas и fragments по fault, upgrade, rack или maintenance domains, чтобы не сломать recoverability.
- `Repair service`: выбирает локальное или глобальное восстановление по типу схемы и характеру отказа.

## 6. Data layout
- Hot tier держит `object-version` в репликах, чтобы сохранить низкую latency и простую запись.
- Warm tier - это не самостоятельный постоянный слой, а переходный staging state: объект ещё обслуживается через replica path, но уже получил часть EC/LRC представления и ждёт завершения конверсии.
- Cold tier хранит `object-version` в EC/LRC stripes; stripe здесь является только физической упаковкой холодного объекта, а не отдельной logical unit управления. Для очень холодных объектов уместны repair-efficient wide LRC или RS/LRC-профили с локальными repair groups.
- Metadata хранит current state, target state, temperature, age, access counter, migration phase и identifiers of placement domains.
- Placement для replicas и fragments должен избегать co-location в одном failure domain; для cold stripes отдельно важны rack and maintenance-zone separation и local repair groups.

## 7. Data flow
- Ingest идёт сначала в hot replicated form, потому что это даёт простой write path и быстрый ack.
- Read для hot данных обслуживается из реплик; для warm данных предпочтителен replica path, а для cold - EC-aware read planner, который старается минимизировать число читаемых fragments и влияние stragglers.
- Update для часто меняющихся данных старается оставаться в hot или warm state; для EC/LRC слоя выгоднее либо batch re-encoding, либо incremental update path, если число изменённых blocks мало.
- Repair сначала использует локальные groups, если они есть; если локального ремонта недостаточно, включается глобальное восстановление stripe.
- Migration идёт по явным фазам `prepare -> copy -> validate -> cutover -> retire`: до `cutover` source layout остаётся authoritative, а после `validate` metadata переключается атомарно.
- Разрешённые логические переходы: `replication -> hybrid staging -> EC/LRC` и обратный путь `EC/LRC -> hybrid staging -> replication`; прямой `replication -> EC/LRC` допускается только для read-mostly или immutable `object-version`, когда staged conversion не даёт выигрыша по cost или слишком медленна.
- Каждый шаг migration выполняется фоном, с throttling и только если ожидаемая экономия превышает conversion cost; state machine может удерживать объект в warm state только до тех пор, пока не выполнены target layout и guard conditions.

## 8. Policy layer
- Temperature model строится на сглаженной частоте обращений, а не на мгновенном шуме; это прямо поддержано конспектами про hot/cold classification, Zebra и HSM.
- Scheme selection многоуровневый: hot - replication, warm - hybrid replication + EC, cold - EC/LRC; это лучше бинарного деления и соответствует диапазонам demand.
- Decision rule формализуется как ordered state machine.
- If `heat >= H_hot_up`, target state is `replication`.
- Else if `heat <= H_cold_down` and (`utilization >= U_high` or `expected_benefit(cold) - conversion_cost > 0`), target state is `EC/LRC`.
- Else target state is `hybrid staging`.
- Если сигналы конфликтуют, выбор идёт к состоянию, которое лучше объясняется доминирующим сигналом: высокая heat тянет к `replication`, высокая utilization тянет к `EC/LRC`, а промежуточная зона удерживается в `hybrid staging`.
- Hysteresis bands `H_hot_up/H_hot_down`, `H_warm_up/H_warm_down` и `H_cold_up/H_cold_down` не дают policy oscillate при пограничных значениях; переход разрешён только после выдержки guard timer.
- Transition triggers включают crossing of heat thresholds, disk utilization thresholds, expected benefit minus conversion cost и recovery pressure, но сами по себе не исполняют переход без проверки guard conditions.
- Policy лучше рассматривать как периодический control loop, а не как решение на каждый запрос; это снижает overhead и соответствует базовым системным работам из корпуса.

## 9. Метрики и план оценки
- Storage efficiency: storage overhead, effective replication factor и доля logical data, обслуживаемая без лишней избыточности.
- Performance: read latency, write latency, tail latency, degraded-read latency и влияние stragglers.
- Transition cost: migration IO, cross-rack traffic, background bandwidth consumption и time-to-convert.
- Repair cost: reconstruction IO, repair network traffic, full-node recovery time и recovery success under failures.
- Policy quality: fraction of data in the right tier, oscillation rate, misclassification rate и cost of late/early migration.
- План оценки: сравнить `3x replication`, статический `RS/LRC`, binary hot/cold policy и предлагаемую многоуровневую схему на `object-version` workloads со skewed, phase-shifting и failure-heavy сценариями.
- Для проверки substrate и transition protocol отдельно нужны read-mostly, write-heavy и mixed-update traces, чтобы увидеть oscillation, migration cost и degraded-read behavior на одной и той же единице управления.
- Источники метрик: survey и benchmarking review для набора измерений, Xorbas и Azure для repair-focused metrics, EC-Store для latency-aware path, HSM и ER-Store для transition behavior.

## 10. Trade-offs, risks, assumptions
- Главный риск - transition cost может съесть выигрыш от более дешёвой cold tier, если данные слишком часто меняют температуру.
- Вторая опасность - слишком грубая классификация; если bins hot/warm/cold выбраны плохо, policy начнёт oscillate или будет запаздывать.
- Warm tier усложняет metadata и data flow, потому что системе нужно поддерживать и реплики, и EC-след одновременно; в этой версии он разрешён только как transition state, а не как вечный третий слой.
- LRC и repair-efficient EC улучшают recovery, но layout-sensitive и не всегда лучший выбор для всех workload'ов.
- Предполагается, что температура и utilization доступны в достаточно чистом виде, а background migration можно throttle-ить без потери SLA.
- Предполагается, что система может временно жить с периодической policy, а не с полностью online per-request optimization.

## 11. Source map
- `azure_ec_atc_2012`*: cold-tier baseline, LRC, cheap reconstruction, fault/upgrade domain placement.
- `benchmarking_ec_object_storage_fgcs_2025`: evaluation metrics and testbed design for object-storage EC.
- `convertible_codes_it_2022`: formal access cost of EC-to-EC conversion.
- `ec_store_icdcs_2018`: latency-aware access planning and load-aware placement inside EC.
- `ec_survey_tos_2024`*: system-wide map of EC trade-offs, terminology and design space.
- `elect_fast_2024`: hotness-aware replication -> EC tiering in LSM-tree storage; used only as a pattern for demand-sensitive switching.
- `er_store_scientific_programming_2021`*: hot/warm/cold policy, periodic conversion and update path.
- `f4_osdi_2014`: warm tier, age-based temperature proxy and transparent migration at file-lifetime level; used only for heat proxy and migration cadence.
- `heart_fast_2019`: infrastructure state as an additional signal for redundancy choice.
- `hsm_ieee_access_2024`: heat + global disk utilization and hysteresis in policy decisions.
- `hyres_arxiv_2025`*: formal hybrid redundancy model for storage cost, loss probability and repair traffic.
- `identifying_hot_cold_icde_2013`: record-level hot/cold classification via access logs and exponential smoothing.
- `lrc_convertible_arxiv_2023`: locality-preserving EC conversion and access-cost lower bounds.
- `morph_sosp_2024`: lifecycle transitions as first-class storage operations and transcode-aware design; used for transition orchestration, not for substrate choice.
- `rapidraid_arxiv_2012`: archival migration from replication to EC.
- `wide_lrc_fast_2023`: wide LRC layout, repair robustness and deployment constraints.
- `xoring_elephants_arxiv_2013`*: repair-efficient EC, locality, repair IO and degraded reads.
- `zebra_iwqos_2016`*: demand-aware multi-tiering and EC-parameter selection per tier.

* = accent subset
