# Lifecycle Controller with Conversion-Aware EC

## 1. Короткая идея
Трёхслойная архитектура хранения: `hot` данные держим на репликации, `warm` переводим в гибридный режим, `cold` переводим в EC/LRC. Ключевая идея варианта в том, что переходы между слоями считаются отдельной стоимостью и выполняются через conversion-aware transcode, а не через полный rewrite.

## 2. Accent subset
- `identifying_hot_cold_icde_2013`: даёт практичную офлайн-классификацию hot/cold по логам обращений и идею дешёвой batch-оценки температуры.
- `hsm_ieee_access_2024`: задаёт policy из двух сигналов, `heat + global disk space utilization`, и показывает необходимость hysteresis.
- `zebra_iwqos_2016`: поддерживает многоуровневый `demand -> tier -> EC parameters -> migration` вместо бинарного hot/cold split.
- `morph_sosp_2024`: даёт lifecycle-пайплайн, где первый переход удешевлён гибридной избыточностью, а последующие - `Convertible Codes`.
- `convertible_codes_it_2022`: фиксирует формальную метрику `access cost` для EC-to-EC transitions.
- `lrc_convertible_arxiv_2023`: связывает conversion cost с locality и даёт нижние границы для дешёвых переходов в merge regime.

## 3. Учитываемый корпус
- `ec_survey_tos_2024`: задаёт общую рамку trade-off между storage efficiency, performance, reliability и `redundancy transitioning`.
- `ec_store_icdcs_2018`: нужен для latency-aware EC layer, где важны access planning, stragglers и chunk movement.
- `hyres_arxiv_2025`: даёт формальную модель hybrid replication + EC и честные метрики `storage cost`, `file loss probability`, `repair traffic`.
- `azure_ec_atc_2012`: подтверждает практичность LRC, sealed extents и фонового перехода от replication к EC в production storage.
- `xoring_elephants_arxiv_2013`: даёт базовый repair-efficient EC baseline и язык locality / reconstruction cost.
- `wide_lrc_fast_2023`: напоминает, что wide LRC надо выбирать с учётом maintenance zones, placement и random-failure durability.
- `benchmarking_ec_object_storage_fgcs_2025`: задаёт метрики оценки для object storage: upload, download, delete, waiting time и fault tolerance.
- `er_store_scientific_programming_2021`: подтверждает, что hot/warm/cold policy можно встроить в data system через temperature conversion tables и разные update paths.
- `elect_fast_2024`: показывает SSTable-level replication-to-EC tiering и offloading только менее горячих данных.
- `rapidraid_arxiv_2012`: даёт дешёвый pipelined archival path из replication в EC.
- `f4_osdi_2014`: подтверждает production-вариант warm storage, transparent migration и age-based temperature proxy.
- `heart_fast_2019`: добавляет второй управляющий сигнал - reliability heterogeneity инфраструктуры.

## 4. Проблема и целевая постановка
Одна схема хранения для всех данных плохо работает: репликация слишком дорога по ёмкости, обычный EC слишком дорог по repair и transition cost, а бинарный `hot/cold` split игнорирует и заполненность кластера, и стоимость миграции. Целевая постановка этого варианта - минимизировать суммарную стоимость хранения, доступа, repair и миграции при сохранении заданного уровня надёжности и без частых oscillation-переходов между режимами.

## 5. Архитектура компонентов
- `Decision engine`: принимает решение о tier и схеме хранения по температуре, demand, заполненности дисков, reliability profile и ожидаемой стоимости перехода.
- `Metadata / control plane`: хранит текущий tier, параметры кодов, историю обращений, placement constraints, hysteresis flags и состояние фоновых transition jobs.
- `Temperature analysis`: периодически считает temperature score из логов доступа, возраста данных, частоты delete/update и, при необходимости, сглаженного demand.
- `Transition orchestration`: запускает фоновые transcode jobs, ограничивает rate миграции, выбирает соседние схемы и следит, чтобы переход не перегружал сеть и storage nodes.
- `Storage nodes / data plane`: держат replicas, hybrid blocks, EC stripes, LRC groups и, где нужно, отдельные metadata/index components для cold tier.

## 6. Data layout
- `Hot tier`: 3-way replication или близкая к ней hybrid configuration для низкой latency и простого repair path.
- `Warm tier`: `replica + EC` layout в духе Morph и ER-Store, где часть данных остаётся на replica path, а паритеты готовятся фоном.
- `Cold tier`: EC/LRC stripes с заранее выбранными параметрами `k, r`, а для wide stripes - с учётом local repair groups и maintenance zones.
- `Metadata`: отдельные записи о temperature status, current scheme, allowed targets, placement domains и transition progress.
- `Placement`: data, parity и replicas распределяются по fault / upgrade / maintenance domains так, чтобы одновременно не ломать repair и не удорожать будущий transcode.
- `Implementation granularity`: архитектура не привязана к одному substrate; она должна работать и для object storage, и для DFS extents, и для SSTable-like units, если система умеет отмечать unit как `sealed` или `transition-eligible`.

## 7. Data flow
- `Ingest`: новые данные пишутся в hot path с репликацией или в гибридную схему, если уже известен быстрый переход в cold tier.
- `Read`: hot данные читаются по replica path, warm данные - по hybrid path, cold данные - через EC/LRC read path или degraded read при отказе.
- `Update`: пока данные активно меняются, система либо удерживает их в hot tier, либо применяет incremental encoding / staged merge, если substrate это поддерживает.
- `Repair`: hot repair опирается на реплики, cold repair - на local parity / EC reconstruction, а repair cost учитывается при выборе target schema.
- `Migration / transition`: когда unit остывает, control plane запускает фоновой transcode, сначала переводя данные в warm hybrid, а затем в cold EC/LRC, если выгода перекрывает cost перехода.

## 8. Policy layer
- `Temperature model`: строится из access logs, smoothing, age, request rate и, при необходимости, delete/update frequency; для отдельных subsystems допускается demand-aware или tablet/SSTable-aware proxy.
- `Scheme selection`: hot - replication, warm - hybrid redundancy, cold - EC/LRC; конкретные параметры выбираются так, чтобы соседний переход был дешёвым и допустимым по reliability.
- `Transition triggers`: пороги по heat, utilization, lifetime и reliability, плюс условие `expected benefit > migration cost`.
- `Safety / throttling / orchestration`: hysteresis-правила не дают системе oscillate, background jobs ограничиваются по bandwidth, а transitions идут только в окна, где они не вытесняют клиентские запросы.
- `Second signal`: если инфраструктура неоднородна по надёжности, policy может смещать target redundancy в сторону более conservative схем, как в HeART.

## 9. Метрики и план оценки
- `Storage overhead` и `effective-replication-factor`.
- `Read latency`, `tail latency` и `degraded-read latency`.
- `Write / update throughput` и `update amplification`.
- `Repair IO`, `repair traffic` и `recovery time`.
- `Transition IO`, `transition network traffic` и `migration wall-clock time`.
- `Placement robustness`, `MTTDL` и `file loss probability`.
- `Policy accuracy`: доля данных, которые находятся в правильном tier, и частота лишних переходов.
- `Evaluation plan`: сравнить вариант с `3-way replication`, статическим RS/LRC, binary hot/cold scheme и policy без conversion-aware transitions; отдельно прогнать workload'ы с skewed demand, разным update rate и разной заполненностью дисков.

## 10. Trade-offs, risks, assumptions
- Чем больше сигналов использует policy, тем выше её сложность и риск неверного порога.
- Если temperature меняется часто, migration cost может съесть выгоду от более экономичной схемы.
- Convertible-friendly параметры и local repair groups ограничивают пространство допустимых EC-конфигураций.
- Для mutable данных нужна чёткая граница, когда unit становится `sealed` или `transition-eligible`; без неё горячий путь будет слишком дорог.
- Hysteresis и throttling уменьшают oscillation, но могут замедлить полезные переходы.
- Архитектура предполагает, что background transcode допустим и не конкурирует критически с клиентским path.
- Результаты будут зависеть от substrate: object storage, DFS, LSM-tree и database tablets имеют разные granularity и разные bottlenecks.

## 11. Source map
- `identifying_hot_cold_icde_2013`: offline hot/cold classification, logging, sampling, exponential smoothing.
- `hsm_ieee_access_2024`: dual-signal policy, thresholds, hysteresis, global disk space utilization.
- `zebra_iwqos_2016`: multi-tier demand-aware encoding, formal tier selection, migration between ranks.
- `morph_sosp_2024`: file-lifetime redundancy management, hybrid redundancy, native transcode path.
- `convertible_codes_it_2022`: formal `access cost`, lower bounds for conversion, multi-target conversion.
- `lrc_convertible_arxiv_2023`: locality-aware conversion, merge regime, optimal access-cost transitions.
- `ec_survey_tos_2024`: broader framing of redundancy transitioning, repair/update trade-offs, deployment constraints.
- `ec_store_icdcs_2018`: latency-aware access planning, load-aware movement, control plane / data plane split.
- `hyres_arxiv_2025`: hybrid replication + EC trade-offs, repair traffic, file loss probability.
- `azure_ec_atc_2012`: sealed extents, background EC, LRC repair efficiency, production write-to-EC pipeline.
- `xoring_elephants_arxiv_2013`: locality, repair-efficient EC, practical repair baseline.
- `wide_lrc_fast_2023`: wide LRC design, maintenance zones, deployment robustness.
- `benchmarking_ec_object_storage_fgcs_2025`: evaluation metrics and benchmark design for EC in object storage.
- `er_store_scientific_programming_2021`: hot/warm/cold policy, temperature conversion table, incremental vs re-encoding update path.
- `elect_fast_2024`: SSTable-level tiering, hotness-aware selection, offloading to cold tier.
- `rapidraid_arxiv_2012`: pipelined archival transition from replication to EC.
- `f4_osdi_2014`: warm tier architecture, transparent migration, age/request-rate temperature proxy.
- `heart_fast_2019`: infrastructure reliability as a second control signal for redundancy selection.
