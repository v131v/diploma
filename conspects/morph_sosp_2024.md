# Morph: Efficient File-Lifetime Redundancy Management for Cluster File Systems

## 1. Библиографическая карточка
- ID: `morph_sosp_2024`
- Авторы: Timothy Kim, Sanjith Athlur, Saurabh Kadekodi, Francisco Maturana, Dax Delvira, Arif Merchant, Gregory R. Ganger, K. V. Rashmi
- Год: 2024
- Тип: conference paper
- Ссылка: https://www.cs.cmu.edu/~rvinayak/papers/Morph-sosp-2024.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + `baseline`
- Для каких разделов диплома полезен: постановка задачи, архитектура пайплайна хранения, related work по гибридной избыточности, раздел про migration/transcode cost
- Какой главный вопрос диплома помогает закрыть: как связать охлаждение данных со сменой схемы хранения так, чтобы переходы не съедали выгоду от более экономичного EC

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `1. Introduction` | 330-331 | Постановка проблемы и ключевая идея Morph | Очень важен |
| `2. Background and Motivation` | 331-332 | Почему life-cycle transitions данных стали массовой и дорогой операцией | Очень важен |
| `3. Morph Overview` | 333 | Общая архитектура решения и деление жизни файла на фазы | Критически важен |
| `4. Early to Mid Life - Hybrid Redundancy` | 333-334 | Гибридная схема `replica + EC` для горячих данных и дешёвого первого перехода | Критически важен |
| `5. Mid to Late Life - Convertible Codes` | 335-336 | Дешёвые EC-to-EC transitions и выбор CC-friendly параметров | Критически важен |
| `6. Implementation` | 336-338 | Как решение встраивается в HDFS и что меняется в metadata, writes и transcode pipeline | Очень важен |
| `7. Evaluation` | 338-342 | Эксперименты на HDFS-кластере и аналитика на production traces Google | Критически важен |
| `8. Related Work` | 342 | Позиционирование относительно ER-Store, StripeMerge и других подходов | Важен |
| `9. Conclusion` | 342 | Финальная формулировка вклада и эффекта Morph | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: быстро формулирует проблему file-lifetime redundancy management и показывает, что переходы между схемами хранения уже являются повседневной практикой крупных data services.
- Ключевые тезисы / аргументы: данные в начале жизни требуют replication-like performance, позже переходят в EC; но обычный transcode через `read - re-encode - write` слишком дорог по I/O.
- Важные механизмы / модель / архитектура: вводится идея двух типов переходов: `replication -> EC` для early-to-mid life и `EC -> wider EC/LRC` для более поздних фаз; Morph делает transcode нативной операцией DFS.
- Числа, метрики, результаты: в abstract заявлены `over 95%` reduction in transcode IO, `50-60%` reduction in total ingest+transcode IO и `20%` reduction in capacity overheads for newly ingested data.
- Что отсюда брать в диплом: очень сильную постановку задачи про то, что сама стоимость перехода между схемами хранения должна быть объектом оптимизации, а не побочным эффектом.
- Ограничения или оговорки: уже из введения видно, что Morph опирается на file lifetime и application-driven transitions, а не на собственную детальную модель температуры данных.

### 4.2 Background and Motivation
- Что делает этот раздел: объясняет, как в больших кластерах сегодня устроен жизненный цикл данных и почему существующая практика транскодирования создаёт серьёзную нагрузку.
- Ключевые тезисы / аргументы: 3-way replication остаётся стандартом для early-life data из-за latency и write throughput; по мере охлаждения данные переходят в narrower RS/LRC, а затем в wider LRC; transcodes уже происходят миллионами в час.
- Важные механизмы / модель / архитектура: paper вводит life-cycle модель `early -> mid -> late`, показывает разницу между replication, RS и LRC и связывает её с operational goals на каждой стадии.
- Числа, метрики, результаты: на одном из Google clusters transcode-only IO составляет `20-33%` от общего ingest+transcode IO; paper подчёркивает ухудшение `bandwidth-per-TB` во времени.
- Что отсюда брать в диплом: это очень полезный мотивационный блок для обоснования того, что temperature-aware pipeline должен учитывать не только текущую схему хранения, но и стоимость будущих переходов.
- Ограничения или оговорки: модель температуры в этом разделе coarse-grained и связана прежде всего со стадией жизни файла.

### 4.3 Morph Overview
- Что делает этот раздел: даёт общую архитектурную картину Morph и разделяет жизненный цикл файла на две главные фазы.
- Ключевые тезисы / аргументы: для early life нужен новый `hybrid redundancy`, чтобы получить почти replication-like behaviour и дешёвый первый переход в EC; для mid-to-late life нужны `Convertible Codes`, чтобы удешевить дальнейшие EC-to-EC transcodes.
- Важные механизмы / модель / архитектура: Morph сочетает new redundancy schemes, placement policies и native `transcode()` interface внутри DFS.
- Числа, метрики, результаты: явных новых цифр здесь немного; главный результат раздела - структурная декомпозиция всей системы.
- Что отсюда брать в диплом: практически готовую архитектурную логику пайплайна хранения, которую можно развить, добавив собственную temperature policy.
- Ограничения или оговорки: paper сразу оставляет за приложением часть решений о target configurations и timing transitions.

### 4.4 Early to Mid Life - Hybrid Redundancy
- Что делает этот раздел: вводит гибридную схему `Hy(c, EC(k, n))` и подробно разбирает её write path, read path, fault tolerance и переход из hybrid в чистый EC.
- Ключевые тезисы / аргументы: горячие данные не стоит сразу писать в чистый EC, но и чистая replication слишком дорога; комбинирование replica(s) и EC stripe позволяет сохранить нужные свойства ранней фазы и почти бесплатно перейти в EC удалением реплик.
- Важные механизмы / модель / архитектура: `Hy(1, EC(k, n))` и `Hy(2, EC(k, n))`; acknowledgement через replica path; background parity generation; отдельные стратегии для small writes и spanning writes; adaptive hybrid reads; recovery из replica или stripe; free transition from hybrid to EC.
- Числа, метрики, результаты: paper подчёркивает снижение ingest IO и capacity overhead относительно `3-r`, а также отсутствие скрытого ухудшения tail latency и degraded-mode behaviour по сравнению с replication-like baseline.
- Что отсюда брать в диплом: это главный архитектурный вклад paper для нашей темы, потому что он показывает, как соединить горячий слой и EC-слой без дорогого полного переписывания данных.
- Ограничения или оговорки: бесплатный первый переход возможен только если будущая EC-схема заложена уже в момент ingest; это ограничивает гибкость, если целевой cold tier заранее неизвестен.

### 4.5 Mid to Late Life - Convertible Codes
- Что делает этот раздел: объясняет, как удешевить более поздние переходы между EC-схемами, когда данные уже не горячие, но хочется ещё уменьшать storage overhead.
- Ключевые тезисы / аргументы: `Convertible Codes` дают те же fault-tolerance properties, что и обычные коды, но позволяют пересчитывать новые parity blocks с меньшим чтением данных; наиболее выгодны переходы, где final stripe хорошо "собирается" из initial stripes.
- Важные механизмы / модель / архитектура: CC и LRCC, выбор `CC-friendly` параметров, правило выбирать final `k` как кратное initial `k`, по возможности держать число parities постоянным, а при росте parity count минимизировать дополнительное I/O.
- Числа, метрики, результаты: paper показывает, что в лучшем случае новые parity blocks можно получить, читая только старые parities; в более сложных сценариях чтение данных остаётся частичным, но всё равно уменьшается.
- Что отсюда брать в диплом: этот раздел нужен как теоретико-практическая база для минимизации transcode cost внутри многоступенчатого pipeline.
- Ограничения или оговорки: большая часть выгоды появляется, когда приложение заранее знает, в какие схемы будут происходить transitions; Morph сам не выбирает schedule переходов.

### 4.6 Implementation
- Что делает этот раздел: показывает, что Morph не остаётся на уровне концепции, а реально интегрируется в HDFS.
- Ключевые тезисы / аргументы: для работы системы нужны изменения не только в кодах, но и в metadata model, write pipeline, placement policies и transcode orchestration.
- Важные механизмы / модель / архитектура: hybrid blocks как единая сущность в metadata, hybrid write pipeline с striper, специальные placement rules для data/parity separation, native transcode path через Namenode/Datanode coordination, реализация CC и LRCC.
- Числа, метрики, результаты: количественный результат здесь не главный; важнее, что paper демонстрирует implementability и crash-consistency aware design.
- Что отсюда брать в диплом: это хороший ориентир для раздела о возможной архитектуре прототипа или симулятора, особенно если диплом будет включать хоть частичную реализацию.
- Ограничения или оговорки: implementation привязана к DFS/HDFS контексту и не переносится один в один в object storage или database systems.

### 4.7 Evaluation
- Что делает этот раздел: проверяет три главных обещания paper: уменьшение lifetime IO/capacity cost, сохранение performance для горячих данных и практическую выгоду Convertible Codes.
- Ключевые тезисы / аргументы: Morph уменьшает end-to-end ingest+transcode cost, не ухудшая client-facing reads/writes для hot data; CC дают реальные, а не только теоретические преимущества.
- Важные механизмы / модель / архитектура: есть microbenchmarks на единичных lifecycle transitions, macrobenchmarks steady-state ingest+transcode, сравнение hybrid redundancy против `3-r` и `RS`, а также аналитика по production traces Google.
- Числа, метрики, результаты: в реализации на HDFS показаны `58%` reduction in disk IO и `55%` reduction in network IO; в macrobenchmark Morph выполняет тот же объём работы на `17%` быстрее; на production traces Google paper заявляет `40-50%` reductions in IO, а transcode IO может снижаться `over 95%`.
- Что отсюда брать в диплом: это очень сильный baseline для experimental section и выбора метрик: disk IO, network IO, capacity overhead, transcode latency, write latency, degraded-mode read behaviour.
- Ограничения или оговорки: результаты сильны именно для file-lifetime transitions и HDFS-like workload assumptions; их нельзя автоматически переносить на любую temperature policy или любой storage substrate.

### 4.8 Related Work
- Что делает этот раздел: позиционирует Morph относительно существующих hybrid and transition-aware systems.
- Ключевые тезисы / аргументы: Morph отличается от ER-Store тем, что умеет ingest directly into hybrid redundancy и делает transitions I/O-efficient; от StripeMerge он отличается generality, file-level integration и реальной DFS implementation.
- Важные механизмы / модель / архитектура: paper чётко разделяет работы про hybrid storage, parameter transitions и special-case code merging.
- Числа, метрики, результаты: чисел нет; важен именно контраст по design scope.
- Что отсюда брать в диплом: готовую формулировку, в чём именно состоит novelty Morph и чего ещё не хватает по сравнению с желаемой temperature-aware системой диплома.
- Ограничения или оговорки: related work section короткий и не покрывает весь температурный literature landscape; его нужно дополнять HSM, ELECT, ER-Store и другими работами.

### 4.9 Conclusion
- Что делает этот раздел: сжимает вклад paper до нескольких утверждений о снижении ingest/transcode cost.
- Ключевые тезисы / аргументы: комбинация hybrid redundancy, placement rules и Convertible Codes позволяет существенно уменьшить I/O на жизненном цикле файла без потери reliability и performance.
- Важные механизмы / модель / архитектура: подчёркивается, что выигрыш создаётся именно сочетанием схем хранения и системной интеграции, а не отдельным алгоритмическим трюком.
- Числа, метрики, результаты: ещё раз фиксируются `over 95%` reduction in transcode IO и `40-50%` reduction in total ingest+transcode IO for large Google services.
- Что отсюда брать в диплом: удобную финальную формулу, почему тема переходов между схемами хранения вообще заслуживает отдельной архитектурной проработки.
- Ограничения или оговорки: conclusion, как и paper в целом, не превращает Morph в готовую temperature-aware control policy.

## 5. Архитектура и устройство системы / метода
- Назначение системы и её место в storage stack: Morph встраивается в distributed file system уровня HDFS и отвечает за управление избыточностью файла на протяжении его жизненного цикла, а не за отдельный codec library или offline transcoder.
- Главные компоненты и их роли:
  - `Client write path`: пишет новые данные в Morph-aware HDFS pipeline и получает replication-like acknowledgment для горячей фазы.
  - `NameNode metadata logic`: хранит информацию о hybrid blocks, target redundancy configuration и transcode state.
  - `DataNode + striper/parity pipeline`: размещают data/parity chunks, выполняют background parity generation и участвуют в native transcode.
  - `Hybrid redundancy layer`: обслуживает early-life phase через сочетание реплики и EC stripe.
  - `Convertible Codes layer`: обслуживает mid-to-late-life EC-to-EC transitions с пониженным I/O.
  - `Placement policy`: определяет, как разнести replicas, data и parity так, чтобы сохранить reliability и удешевить будущий transcode.
- Где находятся `data / parity / replicas / metadata`:
  - в early-life phase файл хранится как `Hy(c, EC(k, n))`, то есть одновременно есть replica component и EC stripe;
  - metadata о составе hybrid block и допустимых transitions поддерживается на уровне DFS namespace;
  - parity chunks размещаются отдельно от data chunks по специальным placement rules, чтобы не ломать recovery и future transcode.
- Как проходят основные операции:
  - `write`: клиентский write path сначала идёт по replica-friendly траектории, а parity generation может завершаться в background;
  - `read`: для горячих данных система старается читать из replica path, а при необходимости переходит к stripe-based reads;
  - `update / overwrite`: paper в основном мыслит file-lifetime storage для DFS workloads, а не мелкогранулярные database updates; важнее ingest and transitions, чем частые in-place updates;
  - `repair`: система может восстанавливать данные либо через replica component, либо через EC stripe, в зависимости от режима отказа и стадии жизни файла;
  - `migration / transition`: первый переход из hybrid в чистый EC делается почти бесплатно удалением replica component, а более поздние EC-to-EC transitions идут через native `transcode()` и Convertible Codes.
- Где принимаются policy-решения:
  - Morph сам не является полной temperature-aware policy engine;
  - paper предполагает, что приложение или внешний controller выбирает timing transition и target redundancy parameters;
  - сама система даёт набор transcode-efficient building blocks, placement rules и parameter suggestions.
- Как выглядит data flow по стадиям жизни файла:
  - `early life`: ingest в `Hy(c, EC(k, n))` ради replication-like performance;
  - `mid life`: удаление replica component и переход к pure EC без полного reread-reencode-rewrite;
  - `late life`: перевод в более wide EC/LRC через Convertible Codes и CC-friendly parameters.
- Что особенно важно для диплома:
  - Morph показывает не просто выбор схем хранения, а архитектуру lifecycle pipeline, где стоимость будущего перехода закладывается уже при ingest;
  - это очень близко к нашей теме, потому что temperature-aware policy можно поставить поверх уже готового transcode-aware storage substrate.
- Ограничения, assumptions и неясности:
  - paper не даёт собственной fine-grained temperature model;
  - schedule и target transitions largely external to Morph;
  - архитектура подробно раскрыта для HDFS/file-system context, но не полностью переносима в object storage или distributed database без адаптации.

## 6. Сквозные выводы по статье
- Проблема: классический `read - re-encode - write` transcode делает смену схемы хранения настолько дорогой по I/O, что она может частично съедать выгоду от более экономичного EC.
- Основная идея / вклад: Morph строит file-lifetime pipeline, где первый переход удешевляется через `hybrid redundancy`, а последующие - через `Convertible Codes` и transcode-aware placement.
- Что нового относительно известных подходов: paper не просто предлагает ещё одну hybrid policy, а делает transcode нативной DFS-операцией и проектирует схемы хранения специально под дешёвые переходы.
- Ключевые trade-off: лучшее future transcode cost достигается ценой более жёсткого планирования target EC schemes заранее; replication-like performance сохраняется, но только благодаря специальным write/read protocols и placement decisions.
- Главные ограничения статьи: Morph не даёт собственной fine-grained temperature model, не выбирает transition schedule автоматически и сильно опирается на HDFS/file-system context.

## 7. Что использовать в дипломе
- Взять идею, что pipeline схем хранения надо оптимизировать не только по steady-state storage overhead, но и по стоимости переходов между стадиями жизни данных.
- Использовать `hybrid redundancy` как сильный baseline для горячего слоя или ранней фазы жизненного цикла, где plain EC слишком дорог по latency и write path.
- Опереться на разделы про `Convertible Codes` и placement-aware transcode при формализации migration/transcode cost в собственной системе.
- Не переносить из Morph без оговорок момент выбора схемы и момент перехода: в paper они largely application-driven, а в дипломе предполагается более явная temperature-aware логика.

## 8. Полезные цитаты
- "Many data services tune and change redundancy configurations of files over their lifetimes to address changes in data temperature and latency requirements."
  Стр.: 330
  Зачем нужна: фиксирует связь life-cycle transitions именно с temperature и latency, а не только с экономией памяти.

- "Morph introduces a hybrid redundancy scheme that combines a replica with an erasure-coded (EC) stripe, reducing both ingest IO and capacity overheads while enabling free transcode to EC by deleting replicas."
  Стр.: 330
  Зачем нужна: это самое ёмкое краткое описание главного механизма paper.

- "Morph achieves a 58% reduction in disk IO and 55% reduction in network IO, compared to HDFS, for a mix of data ingest and file lifetime transitions."
  Стр.: 331
  Зачем нужна: даёт сильный экспериментальный результат, пригодный для baseline comparison.

- "Morph provides the strategic parameters as suggestions to applications, who make the final decision on the choice of the parameters."
  Стр.: 335
  Зачем нужна: аккуратно фиксирует границу применимости paper: Morph помогает сделать transitions дешёвыми, но не снимает с приложения выбор конечной политики.

## 9. Термины и понятия
- `Hybrid redundancy`: схема, где данные одновременно представлены в replicated form и в виде EC stripe.
- `Transcode`: переход файла из одной схемы избыточности в другую в течение его жизненного цикла.
- `Convertible Codes`: класс кодов, предназначенных для удешевления переходов между EC-конфигурациями.
- `CC-friendly parameters`: параметры конечной EC-схемы, подобранные так, чтобы transcode требовал минимального чтения и пересчёта данных.
- `Degraded-mode read`: чтение при отсутствии части chunks, когда системе приходится восстанавливать данные на критическом пути.

## 10. Итог в одном абзаце
Morph - один из самых полезных для диплома system papers, потому что он показывает, как превратить смену схем хранения из дорогой фоновой операции в проектируемую часть архитектуры. Его ключевой вклад состоит в том, что ранняя фаза жизни файла обслуживается через `hybrid redundancy`, а более поздние переходы удешевляются через `Convertible Codes` и специальное placement-aware design. Для нашей темы особенно ценно, что paper связывает жизненный цикл данных, latency requirements и transcode cost в одной системе. При этом Morph не даёт собственной fine-grained модели температуры данных и в значительной степени оставляет выбор расписания переходов за приложением. Поэтому в дипломе его лучше использовать как очень сильный системный baseline и архитектурный каркас, который нужно дополнить явной temperature-aware policy. Это делает paper особенно ценным не только для related work, но и для раздела про проектирование собственной гибридной системы.
