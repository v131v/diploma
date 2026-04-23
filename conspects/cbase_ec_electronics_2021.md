# CBase-EC: Achieving Optimal Throughput-Storage Efficiency Trade-Off Using Erasure Codes

## 1. Библиографическая карточка
- ID: `cbase_ec_electronics_2021`
- Авторы: Chuqiao Xiao, Yefeng Xia, Qian Zhang, Xueqing Gong, Liyan Zhu
- Год: 2021
- Тип: journal article
- Ссылка: https://www.mdpi.com/2079-9292/10/2/126

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + `baseline`.
- Для каких разделов диплома полезен: related work по hybrid redundancy, архитектурный раздел (policy engine и data path), раздел с алгоритмами migration/transition, экспериментальный раздел с метриками throughput/storage efficiency/update/recovery.
- Какой главный вопрос диплома он помогает закрыть: как в распределённой БД связать температуру данных и двусторонние переходы между `3-replication` и `EC/LRC`, чтобы получить выигрыш по storage без критичной потери транзакционной производительности.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `Abstract` | 1 | Краткая постановка: hot/cold-aware redundancy, два алгоритма (recognition + conversion), итоговые 6%/18.4% | Важен |
| `1. Introduction` | 1-2 | Почему DDBMS невыгодно держать всё в replicas и почему чистый EC не подходит для частых транзакций | Критически важен |
| `2. Background` | 2-4 | База по сравнению replication vs EC и исходная архитектура CBase | Очень важен |
| `2.1. Comparison of Replication and Erasure Codes (EC)` | 3 | Термины stripe/k/n, формулы надёжности для EC и replication, график сравнения | Важен |
| `2.2. CBase Database System` | 3-4 | Компоненты `RS/UPS/CS/MS`, query/update flow, RootTable и разделение baseline/incremental данных | Критически важен |
| `3. Dynamic Conversion of Hot and Cold Data Storage` | 4-9 | Основной design CBase-EC: периодическая классификация и конверсия hot/cold tablets | Критически важен |
| `3.1. Hot and Cold Tablets Recognition` | 5-6 | Подсчёт частот через HashTable, температурная модель (Newton cooling), Algorithm 1, новый формат RootTable | Критически важен |
| `3.2. Conversion Strategy of Hot and Cold Tablets` | 6-8 | Четыре типа переходов, sets `cold2hot/hot2cold`, Algorithm 2, LRC-кодирование и fine-grained stripe design | Критически важен |
| `3.3. Load Balancing Scheme` | 8-9 | Формула взвешенной нагрузки по температуре и greedy-перераспределение tablet’ов | Очень важен |
| `4. Optimization Schemes of CBase-EC in Encoding, Decoding and Updating Processes` | 9-10 | Две оптимизации: update path и снижение XOR-complexity | Очень важен |
| `4.1. Update Optimization` | 9 | Recoding vs incremental coding, Algorithm 3 для LRC parity update | Очень важен |
| `4.2. Bitmatrix Normalization` | 10 | Переход к bitmatrix/XOR-представлению и heuristic выбора Cauchy-based матрицы (Algorithm 4) | Важен |
| `5. Experiments` | 10-14 | Тестбенч, OLTP, storage efficiency, encoding/update/recovery результаты | Критически важен |
| `5.1. Online Transaction Processing (OLTP) Performances` | 11-12 | TPS и latency в uniform и 80/20 workload | Критически важен |
| `5.2. Storage Efficiency` | 12 | Стоимостной выигрыш по storage, максимум эффективности 60% | Критически важен |
| `5.3. Encoding Performance Optimization` | 12-13 | Снижение XOR-операций (таблица для разных параметров LRC), среднее 16.18% | Важен |
| `5.4. Update Performance` | 13 | Сравнение recoding и LRC-incremental update на блоковых апдейтах | Очень важен |
| `5.5. Parallel Recovery Performance` | 13-14 | Recovery time: replicas vs coarse/fine-grained CBase-EC | Очень важен |
| `6. Conclusions and Future Work` | 14-15 | Итог по trade-off и направления future work | Важен |
| `References` | 15-16 | Библиография | Низкая |

## 4. Подробный конспект по разделам
### 4.1 Abstract
- Что делает этот раздел: сразу фиксирует проблему DDBMS с неравномерной нагрузкой на shards/tablets и необходимость двусторонних переходов `hot->cold` и `cold->hot`.
- Ключевые тезисы / аргументы: для банковского сценария CBase нужен не только перевод редко читаемых данных в более дешёвую схему, но и обратный путь для роста горячести.
- Важные механизмы / модель / архитектура: заявлены два алгоритма (`hot-cold tablets recognition`, `hot-cold dynamic conversion`) и две оптимизации производительности.
- Числа, метрики, результаты: падение transaction processing не более 6%; рост storage efficiency на 18.4%.
- Что отсюда брать в диплом: компактную формулировку ключевого trade-off и целевой KPI (throughput vs storage efficiency).
- Ограничения или оговорки: abstract не раскрывает цену конверсий по времени/ресурсам и детали устойчивости к отказам.

### 4.2 1. Introduction
- Что делает этот раздел: строит мотивацию, почему в DDBMS нельзя применять чистый EC ко всем данным, несмотря на storage-выигрыш.
- Ключевые тезисы / аргументы:
- `multi-replicas` хорошо для частых чтений/обновлений и throughput.
- `EC` выгоднее по storage overhead, но хуже на read/write path в транзакционном режиме.
- В CBase есть длительно хранимые редко доступаемые данные (cold), что открывает окно для гибридной policy.
- Важные механизмы / модель / архитектура: CBase на read-write separation поверх OceanBase 0.4.2, с baseline + incremental данными и периодическими merge.
- Числа, метрики, результаты: в intro приведены целевые итоговые показатели (до 6% потери throughput и 18.4% прироста storage efficiency).
- Что отсюда брать в диплом: формальную постановку, что для temperature-aware системы нужна именно двусторонняя динамическая конверсия, а не одноразовый archival переход.
- Ограничения или оговорки: в intro нет анализа conversion-cost и параметрической чувствительности (например, к `Rhot`, `alpha`, периодам merge).

### 4.3 2.1 Comparison of Replication and Erasure Codes (EC)
- Что делает этот раздел: задаёт формальную рамку сравнения replication и EC по надёжности при заданной надёжности узла `p` и коэффициенте избыточности `r = n/k`.
- Ключевые тезисы / аргументы: при одинаковом уровне избыточности EC даёт более высокую надёжность при меньшем `r`; в Figure 1b показано, что EC может держать >90% reliability в рассматриваемых точках.
- Важные механизмы / модель / архитектура:
- вводится stripe-модель `k` data blocks + `n-k` parity blocks;
- приводятся формулы (1) и (2) для надёжности EC и replication.
- Числа, метрики, результаты: в подписи к Figure 1b используется `p = 0.8`; график иллюстрирует преимущество EC на меньшей избыточности.
- Что отсюда брать в диплом: формальное обоснование, почему EC нужен как холодный/полухолодный режим, даже если транзакционный путь строится на репликации.
- Ограничения или оговорки: это аналитическое сравнение надёжности без учёта latency, update cost, migration overhead.

### 4.4 2.2 CBase Database System
- Что делает этот раздел: описывает исходную operational architecture, в которую встраивается CBase-EC.
- Ключевые тезисы / аргументы: CBase уже имеет чётко разнесённые роли между сервисами, поэтому policy переходов можно внедрять через metadata layer (`RS` + RootTable), не ломая весь data path.
- Важные механизмы / модель / архитектура:
- `RS`: управление и RootTable (range PK + location);
- `CS`: baseline data и replicas;
- `UPS`: incremental data в MemTable/frozen MemTable;
- `MS`: роутинг query/update и агрегация результата.
- Query path: `client -> MS -> RS/CS/UPS -> MS -> client`.
- Update path: `MS` получает plan, берёт baseline через `CS`, передаёт в `UPS`, `UPS` применяет update.
- Числа, метрики, результаты: чисел почти нет; ценность раздела в конкретном operational pipeline.
- Что отсюда брать в диплом: шаблон разделения control plane (классификация/метаданные) и data plane (чтения/записи/merge).
- Ограничения или оговорки: paper не раскрывает детали консистентности metadata updates между RS и CS при массовых переходах.

### 4.5 3. Dynamic Conversion of Hot and Cold Data Storage (обзор раздела)
- Что делает этот раздел: вводит основной lifecycle CBase-EC: `recognition -> conversion -> load balancing` в каждом периоде `T(n)`.
- Ключевые тезисы / аргументы: период конверсии запускается после завершения ежедневных merge, чтобы не конкурировать с основным merge path.
- Важные механизмы / модель / архитектура: recognition на `RS`, conversion на `CS`; переходы определяются по расхождению текущего hot/cold статуса и предыдущей redundancy strategy.
- Числа, метрики, результаты: `Rhot` по умолчанию 20%.
- Что отсюда брать в диплом: идею периодического orchestration-cycle, связанного с lifecycle данных, а не с каждым отдельным запросом.
- Ограничения или оговорки: нет явной оценки длительности conversion window и влияния на SLA в момент массовой перекодировки.

### 4.6 3.1 Hot and Cold Tablets Recognition
- Что делает этот раздел: определяет, как система вычисляет температуру tablet и формирует очереди переходов.
- Ключевые тезисы / аргументы:
- на CS ведётся HashTable `Tbid -> access frequency` (query+update);
- RS периодически собирает частоты, пересчитывает `t` в RootTable и заново маркирует hot/cold;
- формируются множества `cold2hot-Tbid` и `hot2cold-Tbid`.
- Важные механизмы / модель / архитектура:
- RootTable расширяется полями `HC`, `r`, `t`, `RI`, `size`, `v`;
- температура рассчитывается через Newton-like охлаждение:
`T(tn) = T(tn-1)e^{-alpha(tn-tn-1)} + Theat * F(tn-1)` (формула (5));
- в Algorithm 1 сортировка температур определяет top-`Rhot` множество.
- Числа, метрики, результаты:
- `Rhot` default = 20%;
- `Theat = 1` как шаг нагрева в алгоритме;
- новая tablet стартует с temperature median hot-tablets.
- Что отсюда брать в диплом: рабочую формулу temperature smoothing и механизм агрегирования частот по tablet без per-request heavy analytics.
- Ограничения или оговорки:
- в тексте есть терминологическая/кодировочная неоднозначность между значениями `HC` в таблице (`0 hot, 1 cold`) и строками Algorithm 1;
- не описаны правила выбора `alpha`, чувствительность к длине периода и шуму workload.

### 4.7 3.2 Conversion Strategy of Hot and Cold Tablets
- Что делает этот раздел: описывает саму миграцию между режимами хранения.
- Ключевые тезисы / аргументы:
- рассматриваются четыре состояния: `continuous hot`, `continuous cold`, `cold2hot`, `hot2cold`;
- `cold2hot`: возвращение к three-replicas и обновление metadata (`r = 0`);
- `hot2cold`: перевод в LRC-схему fine granularity и обновление metadata (`r = 1`).
- Важные механизмы / модель / архитектура:
- Algorithm 2 задаёт batch-проход по множествам переходов;
- для `hot2cold` используется `LRC(6,2,2)`; если число переходящих tablet не делится на 6, в комментарии к алгоритму указан fallback на Reed-Solomen;
- Figure 4: cold-tablet кодируется блочно, `Stripe 0` хранит metadata, `Stripes 1..n` — блоки данных.
- Числа, метрики, результаты: явно фиксирован пример `LRC(6,2,2)` и пачки по 6 tablets для кодирования.
- Что отсюда брать в диплом:
- двустороннюю transition-логику `replicas <-> EC`, что особенно важно для temperature-aware систем;
- идею fine-grained coding, которая ограничивает цену апдейтов и ускоряет параллельное восстановление.
- Ограничения или оговорки:
- не дана формальная стоимость/время каждой операции transition;
- неполно раскрыто, как система синхронизирует пользовательские операции во время перекодировки.

### 4.8 3.3 Load Balancing Scheme
- Что делает этот раздел: добавляет балансировку после конверсий, чтобы избежать перекоса по горячим tablet на отдельных CS.
- Ключевые тезисы / аргументы: простое равенство количества tablets больше не отражает нагрузку, поэтому вводится температурно-взвешенная метрика `T̄`.
- Важные механизмы / модель / архитектура:
- формула (6) с весами `(1-Rhot)` для hot и `Rhot` для cold, ориентирована на Pareto 80/20;
- если `|T̄ - Taverage| >= epsilon`, RS greedy-переносит самые горячие tablets на более «холодные» узлы;
- storage load балансируется отдельно, подсчётом total tablets.
- Числа, метрики, результаты: прямые числа не приводятся, но зафиксированы критерии `T̄`, `Taverage`, `epsilon`.
- Что отсюда брать в диплом: раздельный учёт performance load и storage load, плюс policy-level перенос после смены redundancy.
- Ограничения или оговорки: нет эмпирической оценки качества greedy-алгоритма и влияния миграции на сетевой трафик.

### 4.9 4.1 Update Optimization
- Что делает этот раздел: снижает стоимость обновлений для EC-таблет.
- Ключевые тезисы / аргументы:
- recoding выгоден при массовых изменениях по stripe;
- incremental coding выгоден при частичных изменениях, потому что кодируется только дельта.
- Важные механизмы / модель / архитектура:
- Algorithm 3: вычисление `delta` между новой и старой версией блока, адресная отправка `delta` в локальные и глобальные parity tablets;
- при cold-tablet update пересчитываются только local parity в группе и global parity.
- Числа, метрики, результаты: количественные итоги вынесены в Section 5.4.
- Что отсюда брать в диплом: практическую схему update path для гибридной системы, где EC включается только на части данных.
- Ограничения или оговорки: paper не даёт формальный оптимальный порог переключения между incremental и recoding вне конкретных тестов.

### 4.10 4.2 Bitmatrix Normalization
- Что делает этот раздел: ускоряет encode/decode за счёт уменьшения числа XOR.
- Ключевые тезисы / аргументы:
- операции в `GF(2^w)` можно представить через bitmatrix;
- сложность инверсии Vandermonde (`O(n^3)`) выше, чем Cauchy (`O(n^2)`), поэтому авторы переходят к Cauchy-based генератору;
- heuristic в Algorithm 4 выбирает строки с меньшим числом единиц.
- Важные механизмы / модель / архитектура:
- Figure 5 показывает bitmatrix-представление элементов `GF(2^3)`;
- оптимизация целится именно в encode/decode cost на холодных данных.
- Числа, метрики, результаты: итоговое усреднённое улучшение в экспериментах — 16.18% по сокращению XOR.
- Что отсюда брать в диплом: связь между выбором кодовой матрицы и практической стоимостью операций EC.
- Ограничения или оговорки: авторы явно отмечают, что heuristic «не гарантирует оптимум», только хороший локальный результат.

### 4.11 5. Experiments (5.1-5.5) и 6. Conclusions
- Что делает этот раздел: проверяет компромисс throughput/storage и дополнительные аспекты encoding/update/recovery.
- Ключевые тезисы / аргументы:
- CBase-EC оправдан при skewed workload (80/20), но хуже подходит для равномерного доступа;
- storage-выигрыш существенный, но recovery дороже, чем у чистой репликации.
- Важные механизмы / модель / архитектура:
- стенд: 10 серверов, Linux 7.5.18, 8-core Xeon E5-2620 v3, 64 GB RAM, 2 TB disk, 10 Gbps;
- sysBench для OLTP;
- отдельные тесты для storage, encoding XOR, update granularity и recovery.
- Числа, метрики, результаты:
- OLTP при 80/20: performance loss около 5.3%; average response time у three-replicas примерно на 6% лучше;
- storage: при 1 PB исходных данных three-replicas требует 3 PB, CBase-EC в лучшем случае 1.67 PB (storage efficiency до 60%);
- encoding optimization: average reduction of XORs 16.18% (Table 2);
- update: incremental coding быстрее recoding при небольшом числе обновлённых блоков (для LRC(6,2,2) — до `k/2`);
- recovery: CBase-EC восстанавливает дольше replicas, но fine-grained быстрее coarse-grained EC благодаря parallel pipeline.
- Что отсюда брать в диплом:
- численные опоры для trade-off: throughput, latency, storage efficiency, encoding/update/recovery;
- практический тезис: гибридная схема выигрывает на skewed access и проигрывает на uniform.
- Ограничения или оговорки:
- сравнение только с baseline `three-replicas` на одном тестбенче;
- нет сравнения с другими hybrid policy или адаптивными порогами `Rhot`;
- не выделена отдельная метрика conversion cost между периодами.

## 5. Архитектура и устройство системы / метода
- Назначение системы или метода:
- CBase-EC расширяет существующую CBase, добавляя policy-движок, который периодически классифицирует tablets по температуре и переключает режим избыточности для компромисса `throughput <-> storage efficiency`.

- Главные компоненты и их роли:
- `RS (RootServer)`: хранит RootTable, агрегирует частоты доступа, вычисляет температуру, определяет hot/cold, формирует `cold2hot` и `hot2cold`, запускает балансировку.
- `CS (ChunkServer)`: хранит baseline data, replicas и/или coded fragments, ведёт локальный HashTable по обращениям к tablet, выполняет конверсию хранения и parity-операции.
- `UPS (UpdateServer)`: держит incremental данные в `MemTable/frozen MemTable`, применяет update-операции.
- `MS (MergeServer)`: фронтовой роутер запросов, объединяет результаты `CS/UPS`, возвращает клиенту.

- Где находятся data / parity / replicas / metadata:
- `metadata`:
- глобально в RootTable на `RS` (поля `TableID, PK, Tbid, HC, r, t, RI, size, v`);
- локальная runtime-метрика hotness в HashTable на каждом `CS`.
- `baseline data`: на `CS`.
- `incremental data`: в `UPS` (memtable-слой).
- `replicas`:
- для hot-режима — `three-replicas` по CS-узлам (в `RI` хранятся расположения копий).
- `parity/coded data`:
- для cold-режима — LRC-кодирование; в Figure 4 `Stripe 0` содержит metadata-часть, `Stripes 1..n` — блоки, из которых считаются local/global parity.

- Как проходят read / write / update / repair / migration / transition:
- `read`:
1. Клиент отправляет запрос в `MS`.
2. `MS` запрашивает в `RS` карту размещения из RootTable.
3. `MS` обращается в нужные `CS` за baseline и в `UPS` за incremental частью.
4. `MS` сливает ответ и возвращает клиенту.
- `write/update`:
1. Клиентский update приходит в `MS`.
2. `MS` строит план, запрашивает baseline через `CS`, затем передаёт контекст в `UPS`.
3. `UPS` применяет изменения к incremental слою.
4. При merge incremental+baseline запускаются операции обновления избыточности на `CS`.
- `update parity` для cold-tablets:
- либо recoding всего stripe,
- либо incremental update (Algorithm 3): рассчитать `delta`, обновить локальные и глобальные parity-таблеты адресно.
- `repair`:
- baseline `three-replicas` восстанавливает быстрее;
- для CBase-EC восстановление дороже (CPU + кодирование), но fine-grained EC ускоряет процесс через parallel pipeline (Section 5.5).
- `migration/transition` (ядро paper):
1. После ежедневного merge завершается период `T(n-1)` и стартует `T(n)`.
2. `RS` собирает частоты из HashTable `CS`, считает температуры, обновляет `HC/t/r` в RootTable.
3. Формируются sets `cold2hot` и `hot2cold`.
4. `cold2hot`: соответствующие tablets переводятся в three-replicas, `RI` обновляется, `r=0`.
5. `hot2cold`: tablets кодируются LRC (в примере `LRC(6,2,2)`), `RI` обновляется, `r=1`.
6. После конверсии запускается балансировка нагрузки.

- Где принимаются policy-решения:
- на `RS`: temperature recomputation, классификация hot/cold, выбор направления перехода, load balancing decision.
- на `CS`: исполнение решений RS (создание replicas, LRC encoding, parity update, миграция tablet fragments).
- пороговые параметры policy: `Rhot` (default 20%), коэффициент охлаждения `alpha`, допуск балансировки `epsilon`.

- Какие ограничения, assumptions и неясности остаются:
- В Theorem 1 предполагается независимость tablets и отсутствие географического влияния на температуру.
- В статье есть не до конца согласованное кодирование признака `HC` между таблицей и псевдокодом Algorithm 1.
- Не детализированы протоколы согласованности при одновременных пользовательских транзакциях и migration.
- Не дана отдельная количественная оценка conversion overhead (время/трафик) как самостоятельной метрики.
- Эксперименты ограничены одним кластером и сравнением в основном с three-replicas.

## 6. Сквозные выводы по статье
- Проблема: DDBMS с read-write separation нужно одновременно держать высокую транзакционную производительность и снижать избыточность хранения при росте cold-данных.
- Основная идея / вклад: периодическая temperature-aware оркестрация, которая двусторонне переключает tablets между `three-replicas` и `LRC-based EC`.
- Что нового относительно известных подходов: paper не только вводит классификацию hot/cold, но и связывает её с конкретным operational pipeline CBase (`RS/CS/UPS/MS`) и алгоритмами конверсии/обновления parity.
- Ключевые trade-off: storage efficiency растёт заметно, но throughput/latency и recovery ухудшаются на части workload; выигрыш максимален при skewed access, а не при uniform.
- Главные ограничения статьи: CBase-specific дизайн, ограниченный набор baseline-сравнений и неполное раскрытие conversion-cost как отдельного KPI.

## 7. Что использовать в дипломе
- Какие 2-4 идеи стоит взять напрямую:
- Идея 1: периодический цикл `measure hotness -> classify -> transition` как основа policy engine.
- Идея 2: двусторонние переходы `replicas <-> EC`, а не только `hot->cold` архивирование.
- Идея 3: раздельные пути `update` (incremental vs recoding) для снижения стоимости обновлений в EC-слое.
- Идея 4: привязка решения к skewed workload (80/20), а не универсальное применение EC.

- Для какого раздела диплома каждая идея нужна:
- Идея 1: архитектурный раздел и раздел про policy orchestration.
- Идея 2: постановка задачи и related work по migration/transition.
- Идея 3: алгоритмический раздел про write/update path и transcode cost.
- Идея 4: experimental methodology и ограничения применимости.

- Какие метрики / формулировки / сравнения можно опереть на этот источник:
- Throughput/TPS и response time при разных профилях доступа.
- Storage efficiency (включая ориентир до 60% и пример 1 PB -> 1.67 PB против 3 PB).
- Update performance (threshold по числу обновлённых блоков в stripe).
- Encoding complexity через число XOR (средний выигрыш 16.18%).
- Recovery time для replicated и EC-вариантов (coarse/fine-grained).

- Что нельзя переносить в диплом без оговорок:
- Фиксированный `Rhot = 20%` как универсальный порог.
- Конкретный выбор только `LRC(6,2,2)` без анализа других параметров и failure-моделей.
- Утверждение об «optimal trade-off» без дополнительных baseline и multi-workload проверки.

## 8. Полезные цитаты
- "CBase-EC includes hot and cold tablets recognition stage on RS node and dynamic conversion of hot and cold tablets stage on CS nodes."
  Стр.: 4
  Зачем нужна: это прямое архитектурное описание control/data responsibility, полезно для раздела про system design.

- "At the beginning of the new period T, the RS node obtains the access frequency of each tablet from the HashTable in all CS nodes."
  Стр.: 5
  Зачем нужна: фиксирует источник данных для temperature-решений и периодичность policy cycle.

- "There are four types of conversion, namely continuous hot, continuous cold, cold2hot and hot2cold."
  Стр.: 6
  Зачем нужна: краткая и проверяемая формализация state machine переходов между режимами хранения.

- "The experimental results show that although the transaction processing performance declined by no more than 6%, the storage efficiency increased by 18.4%."
  Стр.: 1
  Зачем нужна: ключевой итоговый KPI-компромисс для мотивации гибридного подхода.

- "the CBase performance loss based on CBase-EC strategy was about 5.3%."
  Стр.: 12
  Зачем нужна: уточняет реальную цену по OLTP при 80/20 workload, важную для честного сравнения в дипломе.

- "the maximum storage efficiency of CBase could reach 60% based on CBase-EC, which means that only 1.67 PB actual storage space was needed to store 1 PB data."
  Стр.: 12
  Зачем нужна: даёт конкретную численную опору для раздела о storage-эффективности.

## 9. Термины и понятия
- `Tablet`: shard/подтаблица CBase, минимальная логическая единица классификации по температуре.
- `RS (RootServer)`: управляющий узел CBase с RootTable и policy-логикой.
- `CS (ChunkServer)`: узел хранения baseline/replicas/coded fragments и точка выполнения conversion.
- `UPS (UpdateServer)`: узел incremental updates на базе MemTable/frozen MemTable.
- `MS (MergeServer)`: узел маршрутизации и объединения результатов query/update.
- `RootTable`: таблица метаданных (в CBase-EC содержит в т.ч. `HC`, `r`, `t`, `RI`, `size`, `v`).
- `HC`: hot/cold state tablet.
- `r`: флаг предыдущей/текущей redundancy strategy (`3-replicas` или `EC`).
- `RI`: redundant information (где лежат копии или элементы stripe/паритет).
- `Rhot`: доля tablets, классифицируемых как hot в периоде.
- `cold2hot / hot2cold`: множества tablet IDs для двусторонних переходов между режимами.
- `LRC (Locally Repairable Code)`: код с локальными и глобальными parity-блоками для уменьшения repair/update стоимости.
- `Recoding`: полный пересчёт parity по stripe.
- `Incremental coding`: пересчёт parity только по дельте обновления.

## 10. Итог в одном абзаце
Статья CBase-EC ценна для диплома как практический system paper про реальное совмещение EC и репликации в распределённой БД с read-write separation. Её ключевой вклад в том, что она связывает temperature-aware классификацию с конкретным operational циклом переходов `cold2hot/hot2cold`, а не ограничивается общей идеей tiering. Для архитектурной части диплома особенно важны роли `RS/CS/UPS/MS`, структура RootTable и явные алгоритмы recognition/conversion/update optimization. Для экспериментальной части полезны конкретные числа по цене компромисса: около 5.3-6% потери производительности в ряде сценариев при существенном росте storage efficiency (до 60% в их постановке). Одновременно paper честно показывает границы применимости: на uniform workload выгода хуже, а recovery для EC-варианта медленнее replication. Ограничения источника связаны с CBase-specific окружением и неполной проработкой conversion-overhead как отдельной метрики. Поэтому в дипломе его лучше использовать как baseline архитектуры и policy-логики, дополняя более широкими сравнениями и sensitivity-анализом порогов/параметров.
