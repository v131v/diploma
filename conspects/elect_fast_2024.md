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

## 3. Проблема и мотивация
- Практические KV workload'ы сильно скошены: малая доля ключей часто читается, а большая часть редко используется.
- Репликация хорошо работает для hot tier, но слишком дорога по storage overhead.
- Erasure coding заметно экономит место, но ухудшает access performance и reconstruction cost.
- В LSM-tree системах проблема усложняется тем, что access pattern меняется по уровням SSTables, а не только по отдельным ключам.

## 4. Основная идея / метод
- ELECT построен поверх Cassandra и использует LSM-tree как основу для redundancy transitioning.
- Гранулярность переключения выбрана на уровне SSTables, а не отдельных KV-пар или целых объектов.
- Система сначала пишет данные с replication, а затем в фоне выбирает SSTables последнего уровня LSM-tree для cross-SSTable RS-encoding; после этого вторичные реплики удаляются.
- Hotness-aware policy учитывает две характеристики SSTable: access frequency и lifetime; больший приоритет на encoding получают SSTables с меньшей частотой доступа и большей lifetime.
- Offloading в cold tier применяется только к уже erasure-coded SSTables; при этом в cold tier уходит только data component, а metadata component остаётся в hot tier.
- Для баланса между экономией и производительностью вводится один настраиваемый параметр storage saving target `α`, который определяет, сколько SSTables нужно закодировать и при необходимости вынести в cold tier.

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
