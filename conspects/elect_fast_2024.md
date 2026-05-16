# ELECT: Enabling Erasure Coding Tiering for LSM-tree-based Storage

## 1. Библиографическая карточка
- ID: `elect_fast_2024`
- Авторы: Yanjing Ren, Yuanming Ren, Xiaolu Li, Yuchong Hu, Jingwei Li, Patrick P. C. Lee
- Год: 2024
- Тип: conference paper
- Ссылка: https://www.usenix.org/system/files/fast24-ren.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + `baseline`
- Для каких разделов диплома полезен: постановка задачи, архитектура гибридного хранения, hotness-aware policy, related work по hybrid replication + EC, раздел про degraded reads и recovery cost
- Какой главный вопрос диплома помогает закрыть: как встроить erasure coding в уже работающий LSM-tree KV store так, чтобы горячие данные остались на replication, а менее горячие SSTables можно было выборочно перевести в EC и cold tier

## 3. Карта статьи
| Раздел статьи | Что внутри | Зачем для диплома |
|---|---|---|
| Abstract | Постановка проблемы: в hot tier репликация дорога по месту; идея ELECT как гибрид `replication + EC` на базе LSM-tree. | Краткая формулировка вклада и целевого trade-off. |
| 1. Introduction | Мотивация для edge-cloud tiering, конфликт storage overhead vs performance, вклад ELECT. | Обоснование, почему гибридная избыточность нужна практически. |
| 2. Background | Устройство distributed KV stores (Cassandra), LSM-tree, основы RS erasure coding и цена реконструкции. | Базовая терминология и модель, на которые можно опираться в дипломе. |
| 3. Design Considerations | Пять проектных вопросов (гранулярность, on/off write path, skew/hotness, cold-tier overhead, tunability). | Систематизация дизайн-решений для гибридной системы. |
| 4. ELECT Design | Ключевой дизайн: redundancy transitioning, parity-node selection, cross-SSTable encoding, удаление secondary replicas, hotness-aware offloading, параметр `α`. | Центральный архитектурный baseline для перехода `replication -> EC`. |
| 5. Implementation | Реализация в Cassandra 4.1.0 (Java), около 27K LOC изменений, degraded reads/writes и recovery. | Практическая реализуемость, инженерная цена интеграции. |
| 6. Evaluation | Методология и эксперименты: storage savings, throughput/latency, recovery, sensitivity по `α` и параметрам кодирования. | Численные ориентиры для сравнения в дипломе. |
| 7. Related Work | Сопоставление с работами по EC в KV/LSM, cache/CDN, hybrid redundancy. | Материал для related work и позиционирования собственного подхода. |
| 8. Conclusions | Итог: ELECT снижает storage overhead при близкой normal-path производительности, но с ценой degraded reads/recovery. | Готовая формулировка ограничений и границ применимости. |

## 4. Подробный конспект по разделам
### 4.1 Abstract и §1 Introduction
- Авторы рассматривают storage tiering для KV-нагрузок со скошенным доступом: малый hot-набор и большой cold-набор.
- Репликация удобна для latency/availability, но даёт высокий storage overhead в hot tier (особенно в edge-сценариях).
- ELECT предлагает гибрид: горячие данные остаются на replication, менее горячие переводятся в erasure coding, часть может offload'иться в cold tier.

### 4.2 §2 Background
- Описан Cassandra-подобный distributed KV store: consistent hashing, replication group, primary/secondary replicas.
- Внутреннее хранение через LSM-tree: MemTable, WAL, SSTables по уровням, compaction, чтение по уровням.
- Для EC используется RS-кодирование `(n, k)`; выигрыш по месту сопровождается удорожанием degraded reads и recovery.

### 4.3 §3 Design Considerations
- Q1: гранулярность кодирования. Выбран cross-encoding на уровне SSTables, чтобы не раздувать metadata small-key self-encoding'ом.
- Q2: encoding на write path или в фоне. Выбран offline background transitioning: сначала replication, затем фоновое кодирование.
- Q3: как учесть skew. По наблюдениям авторов, большая доля SSTables в последнем уровне LSM редко читается; EC применяют выборочно туда.
- Q4: как не «сломать» latency cold tier. Offload делается для менее горячих SSTables, чтобы минимизировать частые возвраты данных из cloud.
- Q5: tunable trade-off. Введён параметр `α` (storage saving target) для управления глубиной перехода и offload.

### 4.4 §4 ELECT Design
- §4.1 Redundancy transitioning: процесс разбит на 4 шага: `LSM-tree management -> parity node selection -> cross-SSTable encoding -> secondary replica removal`.
- §4.1.1: в каждом узле реплики разнесены по `R` LSM-trees (1 primary + `R-1` secondary), чтобы управлять удалением secondary replicas после кодирования.
- §4.1.2: parity nodes выбираются детерминированно по hash ring без центрального координатора; coding groups строятся по последовательным узлам.
- §4.1.3: leader parity node собирает `k` data SSTables, создаёт `n-k` parity SSTables, формирует `ECMeta` (hash, size, node id, position).
- §4.1.4: secondary replica removal удаляет только безопасно покрытые версии KV по key list + timestamp, чтобы не удалить более новые данные при асинхронных compaction.
- §4.2 Hotness awareness: приоритет кодирования/offload задаётся по `access frequency` и `lifetime` SSTable.
- §4.3 Балансировка через `α`: сначала увеличивают долю EC, затем offload parity, затем (если нужно) offload data SSTables.

### 4.5 §5 Implementation
- ELECT реализован в Java как модификация Cassandra v4.1.0; в статье указано около `27K` строк изменений.
- Добавлены: redundancy transitioning, hotness monitoring, data offloading, full-node recovery, degraded reads/writes.
- Ограничения явно зафиксированы: нет incremental recovery для отдельных SSTables; нет verification reads для EC KV pairs; нет полной поддержки dynamic topology changes.

### 4.6 §6 Evaluation
- Эксперименты в edge-cloud окружении (Alibaba Cloud), сравнение с vanilla Cassandra.
- Основные результаты: значимая экономия хранилища при близкой normal-path производительности; scan-intensive workload ускоряется.
- Цена подхода проявляется в degraded reads и full-node recovery, где retrieval/decoding увеличивают задержку и стоимость восстановления.
- Sensitivity-анализ показывает, что рост `α` увеличивает экономию, но ухудшает доступ в degraded/частично offloaded режимах.

### 4.7 §7 Related Work
- ELECT позиционируется относительно работ по EC для KV stores, а также подходов к tiering/caching/CDN.
- Отличие акцентируется на LSM-aware переходе `replication -> EC` и сочетании hotness-aware selection с практической интеграцией в Cassandra.

### 4.8 §8 Conclusions
- Вывод статьи: гибридная избыточность в LSM-tree KV store практична при селективном EC для менее горячих SSTables.
- Главный компромисс: снижение storage overhead vs рост degraded-read/recovery издержек.

## 5. Архитектура и устройство системы / метода
- ELECT реализован поверх Cassandra v4.1.0 на Java и вносит около `27 K` строк модификаций; hot tier расположен на edge nodes, а cold tier в эксперименте представлен Alibaba OSS.
- Внутри каждого узла Cassandra хранит не один общий набор реплик, а `R` LSM-trees: одну primary LSM-tree для local primary replicas и `R - 1` secondary LSM-trees для secondary replicas, пришедших от предшествующих узлов в hash ring.
- Redundancy transitioning выполняется на уровне последних SSTables LSM-tree и состоит из четырёх шагов: управление LSM-tree, выбор parity nodes, cross-SSTable encoding и удаление secondary replicas; parity nodes выбираются детерминированно по последовательности в hash ring без центрального координатора.
- Для каждого coding group `k` data SSTables from `n` consecutive nodes кодируются в `n - k` parity SSTables; leader parity node создаёт `ECMeta`, где хранит hash контента data component, размер SSTable, node id и позицию в coding group, а затем распространяет эту metadata в replication group.
- Hotness-aware policy использует две метрики: access frequency и lifetime SSTable; сначала кодируются SSTables с меньшей частотой доступа и большим lifetime, а затем ELECT offloads parity SSTables, и только после этого data SSTables.
- При offloading в cold tier перемещается только data component SSTable, а metadata component остаётся в hot tier; при чтении или compaction система поднимает data component обратно в hot tier, если SSTable лежит в cold tier.
- Write path остаётся replication-based: новые KV pairs сначала пишутся через Cassandra workflow, а background redundancy transitioning и delta-based parity updates происходят позже; при failed writes ELECT использует hinted handoff как Cassandra.
- Read path разделён на normal и degraded mode: для replicated KV pairs используется обычный Cassandra read path, а для erasure-coded KV pairs ELECT либо читает из primary LSM-tree, либо при потере данных делает degraded read и восстанавливает SSTable по `ECMeta` из других data/parity SSTables.
- Recovery тоже идёт по типу размещения: replicated SSTables на нижних уровнях восстанавливаются из реплик, а erasure-coded SSTables последнего уровня декодируются по `k` data/parity SSTables; для secondary LSM-tree после recovery остаются только metadata components у erasure-coded SSTables.
- Границы архитектуры paper честно ограничены: ELECT не поддерживает incremental recovery для отдельных SSTables, не верифицирует reads для erasure-coded KV pairs и не поддерживает dynamic topology changes.

## 6. Сквозные выводы по статье
- ELECT показывает, что hybrid redundancy в LSM-tree-based KV store имеет смысл, если hot data остаётся на replication, а EC применяется выборочно к последнему уровню SSTables.
- Главный системный выигрыш paper - заметное снижение hot-tier storage overhead без сильной просадки обычных reads, writes и updates.
- Главная цена такого подхода - degraded reads и full-node recovery, потому что при сбое системе приходится тянуть data/parity SSTables из других узлов или из cloud.
- Численно paper сообщает `56.1%` storage savings на edge и `39.1%` overall storage savings против Cassandra, `2.84×` throughput gain на scan-intensive workload, `5.32×` рост degraded-read latency и около `1957.64 ms` на `1 MiB` full-node recovery, где `93.3%` времени уходит на retrieval data/parity SSTables.
- Важная практическая оговорка paper состоит в том, что экономия достигается не только за счёт EC, но и за счёт decoupled replication management, hotness-aware selection и удержания metadata components в hot tier.

## 7. Что использовать в дипломе
- Источник можно брать как practical system baseline для частного случая гибридного пути `replication -> EC` в LSM-tree KV storage.
- Его удобно цитировать в разделе про архитектуру, где нужно показать, как именно разделяются write path, background transitioning, offloading и recovery.
- Он полезен для аргументации, что temperature-aware policy должна учитывать не только access frequency, но и lifetime SSTables, а сама EC-часть должна быть select-on-last-level, а не global.
- Нельзя переносить из paper без оговорок его ограничения: это не общая temperature model, не multi-step EC/LRC pipeline и не готовый controller для выбора схем хранения.
- Для related work и comparison section это хороший пример того, что EC в hot tier возможен, но требует честного учёта degraded reads, recovery cost и границ применимости к Cassandra-like systems.
- Ограничения paper: это решение для LSM-tree/Cassandra-like системы; оно не переносится напрямую на произвольные object/block storage, не поддерживает incremental recovery для отдельных SSTables и dynamic topology changes, а hotness в нём задаётся только через access frequency и lifetime, без общей temperature model.

## 8. Полезные цитаты
- "ELECT incorporates hotness awareness and selectively converts data from replication to erasure coding in the hot tier and offloads data from the hot tier to the cold tier."
  Стр.: 2
  Зачем нужна: фиксирует центральный механизм tiering и то, что переключение идёт по hotness-aware policy.
- "A larger α implies that more SSTables are erasure-coded and offloaded from the hot tier to the cold tier, and vice versa."
  Стр.: 8
  Зачем нужна: фиксирует смысл управляющего параметра `α` и то, как paper балансирует storage savings и performance.
- "ELECT achieves 56.1% storage savings (in the edge only) and 39.1% overall storage savings (in both the edge and cloud) compared with Cassandra."
  Стр.: 10
  Зачем нужна: фиксирует главный численный результат и его контекст сравнения.
- "ELECT does not support incremental recovery for individual SSTables as in Cassandra."
  Стр.: 9
  Зачем нужна: честно фиксирует важное ограничение реализации и применимости подхода.

## 9. Термины и понятия
- `LSM-tree`: структура хранения, где данные накапливаются в MemTable и SSTables, а затем compact'ятся по уровням.
- `SSTable`: неизменяемый sorted file с KV-парами; в ELECT это основная единица для encoding, offloading и recovery.
- `Redundancy transitioning`: переход от replication к erasure coding на уровне SSTables.
- `Hotness awareness`: политика выбора SSTables для encoding/offloading на основе частоты доступа и lifetime.
- `Storage saving target α`: настраиваемый параметр, задающий желаемую степень экономии места и объём данных для перевода в EC.
- `Cross-SSTable encoding`: кодирование сразу нескольких SSTables как одной coding group.
- `ECMeta`: metadata для coding group, которая позволяет восстановить erasure-coded SSTables и отслеживать их размещение.
- `Hinted handoff`: механизм Cassandra для replay write на временно недоступный узел.

## 10. Итог в одном абзаце
ELECT показывает, как можно встроить erasure coding в уже существующий distributed KV store без отказа от репликации для горячих данных. Его сильная сторона в том, что переход между схемами хранения делается осмысленно: через hotness-aware selection на уровне SSTable, LSM-tree layout и одну настраиваемую цель по экономии storage. Для диплома это полезно как практический пример частного перехода `replication -> EC`, где схема хранения зависит не только от частоты доступа, но и от стадии жизненного цикла данных. Источник хорошо подходит для аргументации, что hybrid redundancy может быть практичным, если переводить на EC не все данные подряд, а только менее горячие SSTables и делать это выборочно в фоне. В то же время paper показывает пределы такого подхода: degraded reads и recovery дороже, чем у чистой репликации, hotness-модель остаётся грубой, а переносимость решения ограничена LSM-tree/Cassandra-подобными системами.
