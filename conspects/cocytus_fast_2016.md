# Efficient and Available In-memory KV-Store with Hybrid Erasure Coding and Replication

## 1. Библиографическая карточка
- ID: `cocytus_fast_2016`
- Авторы: Heng Zhang, Mingkai Dong, Haibo Chen
- Год: 2016
- Тип: conference paper
- Ссылка: https://www.usenix.org/conference/fast16/technical-sessions/presentation/zhang-heng

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + `baseline`
- Для каких разделов диплома полезен: related work по hybrid replication+EC, архитектурные решения для online recovery, ограничения гибридных схем при metadata-heavy/update-heavy workloads
- Какой главный вопрос диплома он помогает закрыть: как построить практичную гибридную схему, где репликация и EC разделяются по типу данных, и при этом сохраняются консистентность и доступность при отказах

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `Abstract` | 167 | Заявка на hybrid design (PBR для metadata/key, EC для values), ключевые результаты по памяти и recovery | Критически важен |
| `1. Introduction` | 167-168 | Мотивация in-memory KV, проблема memory overhead репликации, вклад Cocytus | Критически важен |
| `2. Background and Challenges` | 168-169 | База по PBR/RS-кодам, вычислительные возможности CPU, ключевые сложности для KV-store | Очень важен |
| `3. Design` | 169-171 | Интерфейс/допущения, coding groups, interleaved layout, piggyback-консистентность | Критически важен |
| `4. Recovery` | 171-173 | Подготовка recovery, online protocol, обработка запросов во время восстановления, migration | Критически важен |
| `5. Implementation` | 173-174 | Детали реализации в Memcached 1.4.21: deterministic allocator, pre-alloc, recovery leader | Очень важен |
| `6. Evaluation` | 174-177 | Setup и сравнение с PBR/Memcached: память, latency/throughput, recovery, coding schemes | Критически важен |
| `7. Related Work` | 177-178 | Контекст по separation, EC и replication | Умеренно важен |
| `8. Conclusion and Future Work` | 178 | Итоговые выводы и ограничения/future work | Важен |

## 4. Подробный конспект по разделам
### 4.1 Abstract + Introduction
- Что делает этот раздел: формулирует цель совместить высокую доступность и лучшую memory efficiency для in-memory KV-store.
- Ключевые тезисы / аргументы: чистый PBR дорог по памяти (`M+1` копий), но чистый EC даёт проблемы с update path и recovery latency; Cocytus предлагает гибрид.
- Важные механизмы / модель / архитектура: разделение на metadata/key (репликация) и values (EC), плюс online recovery, который не выключает обслуживание запросов.
- Числа, метрики, результаты: заявлена экономия памяти `33%–46%` относительно PBR при tolerating two failures; подчёркнута способность CPU кодировать на скоростях уровня сети.
- Что отсюда брать в диплом: формулировку design point для гибридной системы EC+replication и аргумент, почему metadata-path нельзя просто кодировать как bulk data.
- Ограничения или оговорки: сразу заявлен CPU-overhead для update-intensive нагрузок.

### 4.2 Section 2: Background and Challenges
- Что делает этот раздел: связывает классические PBR/RS-модели с требованиями in-memory KV.
- Ключевые тезисы / аргументы: PBR прост для availability, но с плохой storage efficiency; EC эффективнее по памяти, но чувствителен к частым мелким апдейтам и конкурентному recovery.
- Важные механизмы / модель / архитектура: описание RS(K,N), обновления parity через delta, и требования согласованности при конкурентных изменениях.
- Числа, метрики, результаты: для 5-node cluster показаны encode/decode скорости `4.24–5.52 GB/s`; для RS(3,5) storage efficiency `60%` против `33%` у репликации при двух отказах.
- Что отсюда брать в диплом: baseline trade-off между memory efficiency и operational complexity.
- Ограничения или оговорки: формульная часть в extracted text частично шумная, но смысл восстановим по PDF.

### 4.3 Section 3.1: Interface and Assumption
- Что делает этот раздел: задаёт эксплуатационные границы применимости Cocytus.
- Ключевые тезисы / аргументы: интерфейс ограничен `get/set`; целевая зона - read-mostly workloads с крупнее values, чем keys.
- Важные механизмы / модель / архитектура: synchronous semantics для `set` (ответ после подтверждений backup/parity), fail-stop/omission model, требование внешнего слоя для durability при full-cluster outage.
- Числа, метрики, результаты: количественных метрик нет, но есть важная гарантия crash-consistency на уровне acknowledge path.
- Что отсюда брать в диплом: чётко прописанные assumptions для честного сравнения с другими hybrid schemes.
- Ограничения или оговорки: Byzantine/commission faults и полное обесточивание не покрываются.

### 4.4 Section 3.2: Architecture
- Что делает этот раздел: вводит core unit системы - coding group.
- Ключевые тезисы / аргументы: `get` затрагивает один data process; `set` обновляет metadata (с репликацией) и отправляет diff на parity processes.
- Важные механизмы / модель / архитектура: шардирование на coding groups; внутри группы K data processes + M parity processes; кодирование по virtual address space; отсутствие прямой коммуникации между data processes для fault isolation.
- Числа, метрики, результаты: параметризация через K и M; обсуждение влияния K/M на memory efficiency, write cost и fault tolerance.
- Что отсюда брать в диплом: архитектурный паттерн, где data plane для чтения остаётся локальным, а write/redundancy path вынесен в coordinated update.
- Ограничения или оговорки: при росте K растёт нагрузка на parity side; при росте M падает эффективность по памяти и дорожают set-операции.

### 4.5 Section 3.3: Separating Metadata from Data
- Что делает этот раздел: объясняет, почему metadata/key выделены в отдельный режим избыточности.
- Ключевые тезисы / аргументы: кодирование metadata в KV-store порождает слишком много мелких parity updates и ухудшает recovery availability.
- Важные механизмы / модель / архитектура: parity processes хранят metadata всех data processes в группе; для values применяется deterministic allocator, чтобы layout был согласован между процессами.
- Числа, метрики, результаты: прямых чисел в разделе мало, но далее в evaluation показан вклад metadata в overhead.
- Что отсюда брать в диплом: практический критерий разделения на replication/EC не только по temperature, но и по granularity/update pattern данных.
- Ограничения или оговорки: metadata replication частично съедает теоретический выигрыш EC.

### 4.6 Section 3.3 (Interleaved Layout)
- Что делает этот раздел: устраняет дисбаланс ресурсов между data и parity ролями.
- Ключевые тезисы / аргументы: если parity держать обособленно, будут перекосы по CPU/memory; interleaving групп по узлам выравнивает нагрузку.
- Важные механизмы / модель / архитектура: каждый узел запускает и data, и parity процессы разных групп; при падении узла recovery распределяется по кластеру.
- Числа, метрики, результаты: обсуждение масштабирования по трём осям: `K`, `M`, число групп.
- Что отсюда брать в диплом: идею interleaving как инженерный ответ на асимметрию read-mostly vs write-intensive режимов.
- Ограничения или оговорки: больше K/M не бесплатно, у каждого параметра свой системный trade-off.

### 4.7 Section 3.4: Consistent Parity Updating with Piggybacking
- Что делает этот раздел: даёт протокол консистентного обновления parity без полной цены классического 2PC.
- Ключевые тезисы / аргументы: атомарная рассылка на несколько parity processes обязательна; иначе recovery может собрать неконсистентное состояние.
- Важные механизмы / модель / архитектура: `xid` как логические часы на data process; parity буферизует операции и ACK-ает; после ACK от всех parity запрос считается stable; следующий запрос piggyback-ит latest stable xid и переводит более ранние операции в READY/commit.
- Числа, метрики, результаты: качественный выигрыш - избегается удвоение I/O раундов, характерное для явного 2PC на каждый set.
- Что отсюда брать в диплом: reusable шаблон lightweight consistency для distributed parity updates.
- Ограничения или оговорки: протокол усложняет recovery логику и требует аккуратного управления request buffers.

### 4.8 Section 4.1: Data Recovery (общая модель)
- Что делает этот раздел: формализует критерий согласованности блоков перед декодированием.
- Ключевые тезисы / аргументы: data blocks и parity blocks снабжаются логическими timestamp’ами (`T`, `VT[1..K]`), и recovery допустим только после выравнивания этих состояний.
- Важные механизмы / модель / архитектура: двухфазная схема recovery: `preparation` + `online recovery`.
- Числа, метрики, результаты: количественно ключевой показатель preparation-блокировки дан в 4.1.1.
- Что отсюда брать в диплом: формализацию минимального condition set для консистентного декодирования в живой системе.
- Ограничения или оговорки: механика опирается на корректность буферов parity и стабильные xid.

### 4.9 Section 4.1.1: Preparation
- Что делает этот раздел: подготавливает parity side к безопасному online recovery.
- Ключевые тезисы / аргументы: выбирается `stable xid` как минимум из latest xid по parity процессам; операции с xid выше stable отбрасываются как не полностью распространённые.
- Важные механизмы / модель / архитектура: синхронизация request buffers на parity процессах и установка единой точки согласованности.
- Числа, метрики, результаты: блокировка запросов на этапе preparation всего `7–13 ms` даже под высокой нагрузкой.
- Что отсюда брать в диплом: конкретный приём для bounded stop-the-world окна перед онлайн-восстановлением.
- Ограничения или оговорки: есть краткая блокировка сервиса, полностью lock-free recovery не заявляется.

### 4.10 Section 4.1.2: Online Recovery Protocol
- Что делает этот раздел: описывает пошаговый протокол восстановления recovery unit’ов (4KB).
- Ключевые тезисы / аргументы: восстановление делается unit-by-unit, параллельно с обслуживанием запросов; recovery initiator собирает данные от живых data processes, затем parity-derived остатки и декодирует пропавшие блоки.
- Важные механизмы / модель / архитектура: 5 шагов протокола, включая subtraction данных из parity на recovery processes, передачу итоговых parity-unit инициатору и решение системы уравнений для failed blocks.
- Числа, метрики, результаты: гранулярность `4 KB` на recovery unit.
- Что отсюда брать в диплом: дизайн online repair pipeline, где recovery и service path сосуществуют.
- Ограничения или оговорки: корректность зависит от предварительной stable-xid синхронизации и дисциплины применения buffered updates.

### 4.11 Section 4.1.3: Request Handling on Recovery Process
- Что делает этот раздел: показывает поведение data plane во время recovery.
- Ключевые тезисы / аргументы: recovery process обслуживает `get/set`; если требуемые data blocks ещё не восстановлены, инициируется recovery на лету.
- Важные механизмы / модель / архитектура: lookup через backup hashtable; для `set` выделяется новое пространство, и при необходимости выполняется до-восстановление затронутых блоков.
- Числа, метрики, результаты: чисел нет, но это ключ к continuous availability.
- Что отсюда брать в диплом: практический шаблон degraded-mode обслуживания без полной остановки кластера.
- Ограничения или оговорки: `set` при recovery может просаживаться из-за ожидания восстановления нужных блоков.

### 4.12 Section 4.2: Data Migration
- Что делает этот раздел: закрывает контур возврата к нормальному размещению после аварийного in-place recovery.
- Ключевые тезисы / аргументы: migration разделена на metadata-first и value-data этапы; recovery process временно проксирует часть восстановления для нового data process.
- Важные механизмы / модель / архитектура: отдельные процедуры для data process recovery и parity process recovery; на parity path используется `miss bit` и предварительная отправка data blocks перед parity updates, если есть риск рассинхронизации.
- Числа, метрики, результаты: явных чисел нет.
- Что отсюда брать в диплом: структуру transition-процесса после отказа (recover -> migrate -> retire temporary role).
- Ограничения или оговорки: если в ходе migration падает один из критичных участников, операция откатывается к сценарию data-process failure.

### 4.13 Section 5: Implementation
- Что делает этот раздел: показывает, что дизайн реализован поверх реальной системы (Memcached), а не только в модели.
- Ключевые тезисы / аргументы: реализация на Memcached 1.4.21, около `3700` SLoC; используется synchronous model.
- Важные механизмы / модель / архитектура: deterministic allocator на AVL-структурах (free/allocated trees), pre-allocation для сохранения order-consistency во время recovery, recovery leader для устранения дублирующих восстановлений, short-cut logic при последовательных отказах.
- Числа, метрики, результаты: `~3700` SLoC добавлено; указано, что текущая версия single-thread, data migration поддержана не полностью.
- Что отсюда брать в диплом: список инженерных деталей, которые обычно отсутствуют в “чистых” архитектурных схемах, но критичны для корректности.
- Ограничения или оговорки: нет полной production-ready реализации multi-thread migration path.

### 4.14 Section 6.1: Experimental Setup
- Что делает этот раздел: задаёт сравнимый baseline для Cocytus, PBR и vanilla Memcached.
- Ключевые тезисы / аргументы: 6-node cluster, 5 серверных узлов + 1 клиент; Cocytus сконфигурирован как пять interleaved RS(3,5) групп (всего 15 data + 10 parity processes).
- Важные механизмы / модель / архитектура: сравнение с PBR (15 primary + 30 backup processes) и Memcached (15 processes), YCSB с Zipfian keys и read/write режимами 50:50, 95:5, 100:0.
- Числа, метрики, результаты: value sizes `1KB/4KB/16KB`; hardware каждого узла: `2x10-core 2.3GHz Xeon E5-2650`, `64GB RAM`, `10Gb` сеть.
- Что отсюда брать в диплом: аккуратную методику бенчмаркинга hybrid redundancy решений.
- Ограничения или оговорки: масштаб кластера ограничен (6 узлов), поэтому extrapolation на большие deployment’ы требует осторожности.

### 4.15 Section 6.2: Memory Consumption
- Что делает этот раздел: измеряет главный выигрыш Cocytus по памяти.
- Ключевые тезисы / аргументы: EC на values действительно снижает память относительно PBR, но metadata replication создаёт добавочный overhead.
- Важные механизмы / модель / архитектура: раздельный учёт Cocytus-Data и Cocytus-Metadata.
- Числа, метрики, результаты: экономия до `46%` (16KB values), общий диапазон `33%–46%`; фактический overhead `1.7x–2x` вместо идеальных `1.66x` для RS(3,5); доля metadata/keys в памяти `25%` (1KB), `9.5%` (4KB), `4%` (16KB); при малых variable values (10B–1KB, Zipf) всё ещё около `20%` экономии против PBR.
- Что отсюда брать в диплом: количественное подтверждение, что гибрид выигрывает сильнее на более крупных values и теряет часть выгоды на metadata-heavy профилях.
- Ограничения или оговорки: для very small values выигрыш заметно сжимается.

### 4.16 Section 6.3: Performance
- Что делает этот раздел: оценивает цену гибридной схемы в latency/throughput.
- Ключевые тезисы / аргументы: Cocytus близок к PBR и близок к vanilla по throughput; overhead заметен главным образом на write path.
- Важные механизмы / модель / архитектура: объяснение через CPU/network профиль и queueing effects (set preemption get в read-mostly режиме).
- Числа, метрики, результаты: network traffic в profiling: Memcached `540Mb/s`, PBR `2.35Gb/s`, Cocytus `2.3Gb/s`; CPU utilization у Cocytus выше в write-heavy профиле (таблица 2), но throughput остаётся сопоставимым.
- Что отсюда брать в диплом: аккуратную формулировку trade-off: memory gain оплачивается CPU/network и write-latency, но не разрушает throughput в целевых профилях.
- Ограничения или оговорки: при update-intensive нагрузке write path ощутимо тяжелее.

### 4.17 Section 6.4: Recovery Efficiency
- Что делает этот раздел: проверяет поведение под реальными отказами во время нагрузки.
- Ключевые тезисы / аргументы: recovery выполняется online и достаточно быстро, без полного коллапса сервиса, особенно в read-only/read-mostly режимах.
- Важные механизмы / модель / архитектура: два последовательных node failures (на 60s и 100s), сравнение Cocytus/PBR и blocked-варианта Cocytus.
- Числа, метрики, результаты: скорость repair без клиентских запросов около `550MB/s`; в recovery latencies (50/90/99%) около `408us/753us/1117us`; blocked-вариант показывает сильный провал throughput даже при 5% writes.
- Что отсюда брать в диплом: аргумент в пользу online recovery как обязательного требования для практической гибридной системы.
- Ограничения или оговорки: двойной отказ заметнее влияет на производительность, особенно при частых set.

### 4.18 Section 6.5: Different Coding Schemes
- Что делает этот раздел: показывает чувствительность к выбору RS-параметров.
- Ключевые тезисы / аргументы: RS(4,5) экономичнее по памяти, RS(2,5) хуже по write-latency из-за большего числа parity-сообщений, throughput в целом близкий.
- Важные механизмы / модель / архитектура: сравнение RS(2,5)/RS(3,5)/RS(4,5) при одинаковой платформе.
- Числа, метрики, результаты: без доминирующего server bottleneck различия в throughput небольшие; latency-эффекты соответствуют сетевой/координационной цене parity path.
- Что отсюда брать в диплом: обоснование, что выбор EC-параметров должен быть policy-параметром, а не фиксированной константой.
- Ограничения или оговорки: экспериментальный масштаб и конфигурация ограничены.

### 4.19 Sections 7-8: Related Work + Conclusion
- Что делает этот раздел: позиционирует Cocytus среди separation/EC/replication работ и фиксирует итоговый вклад.
- Ключевые тезисы / аргументы: новизна в сочетании hybrid storage layout + consistent online recovery для in-memory KV-store.
- Важные механизмы / модель / архитектура: акцент на orthogonality к другим ускорениям KV-store (например, RDMA/concurrency optimizations).
- Числа, метрики, результаты: количественных новых результатов нет, но подтверждена итоговая связка «similar performance to PBR + higher memory efficiency».
- Что отсюда брать в диплом: финальную формулировку вклада и границ применимости.
- Ограничения или оговорки: future work прямо признаёт необходимость масштабирования, альтернативных coding schemes и расширения на другие in-memory stores/DB.

## 5. Архитектура и устройство системы / метода
- Назначение системы или метода: Cocytus - это практическая схема отказоустойчивости для in-memory KV-store, которая уменьшает memory cost относительно полного replication, сохраняя сильную консистентность и доступность.
- Главные компоненты и их роли:
- `Data process` (K в группе): хранит value-блоки, обслуживает `get/set`, генерирует diff для parity.
- `Parity process` (M в группе): хранит parity-блоки values и реплицированные metadata/key для всех data processes группы; участвует в подтверждении set и recovery.
- `Coding group`: единица отказоустойчивости и кодирования (K data + M parity).
- `Recovery process`: роль parity process, временно замещающая упавший data process и выполняющая online recovery.
- `Recovery leader`: координирует recovery, чтобы избежать дублирования восстановления одинаковых блоков.
- `Deterministic allocator + pre-alloc`: обеспечивает одинаковый порядок/результат аллокаций на разных процессах, что критично для консистентности.
- Где находятся data / parity / replicas / metadata:
- `Data`: values размещаются на data processes в coding group.
- `Parity`: кодовые parity values - на parity processes той же группы.
- `Replicas`: metadata и keys реплицируются по primary-backup схеме и хранятся на parity side.
- `Metadata`: mapping (hash table) + allocation metadata; часть метаданных специально оставлена в replicated форме, не в EC.
- Как проходят read / write / update / repair / migration / transition:
- `Read (get)`: обычно идёт на один data process; при отказе обслуживается recovery process через backup metadata и при необходимости триггерит восстановление отсутствующих data units.
- `Write (set)`: synchronous path: data process выполняет update metadata/key в primary-backup схеме, формирует value-diff и рассылает parity updates; запрос считается stable только после ACK от всех parity processes, после чего отправляется ответ клиенту.
- `Update consistency`: каждый запрос имеет `xid`; parity process сначала буферизует update по xid, следующий parity-update piggyback-ит latest stable xid, после чего parity process помечают меньшие xid как READY и применяют их по порядку; при сбое операции выше stable xid отбрасываются.
- `Repair`: при падении узла запускается preparation (выбор stable xid, отбрасывание нестабильных операций), затем online recovery unit’ов по 4KB с участием живых data и parity процессов.
- `Migration`: после in-place recovery данные и metadata переносятся на новый/перезапущенный data process (metadata-first, затем values); parity recovery выполняется через miss-bit маркировку и дозагрузку нужных data blocks.
- `Transition`: временный переход ролей (parity->recovery process) с последующим возвратом к штатному размещению после завершения migration.
- Где принимаются policy-решения:
- На этапе конфигурации кластера выбираются `K`, `M` и число coding groups (trade-off память/CPU/доступность).
- На runtime для консистентности принимаются решения по stable xid, выбору recovery process/leader и pre-allocation.
- Политики по temperature данных в статье не рассматриваются; гибрид здесь основан на типе данных (metadata/key vs value), а не на hot/cold классификации.
- Какие ограничения, assumptions и неясности остаются:
- Модель отказов: fail-stop omission only; Byzantine/commission вне scope.
- Durability при полном outage вынесена во внешний слой (или NVDIMM).
- Реализация на момент статьи: single-thread модель; data migration «not fully supported».
- Нет детального production-описания оркестрации membership/view-change, подразумевается внешний механизм.

## 6. Сквозные выводы по статье
- Проблема: полная репликация in-memory KV-store слишком дорога по памяти, а прямое применение EC к KV update path порождает дорогие мелкие обновления и сложный recovery.
- Основная идея / вклад: гибридно разделить режимы избыточности (replication для metadata/key, EC для values) и добавить online recovery с консистентным parity-update протоколом.
- Что нового относительно известных подходов: в одной системе собраны (1) memory-efficient value protection, (2) crash-consistent synchronous semantics, (3) recovery без полной остановки обслуживания.
- Ключевые trade-off: значимая экономия памяти против роста CPU/network нагрузки и более сложного write/recovery control path.
- Главные ограничения статьи: фокус на read-mostly, ограниченная реализация migration/multithreading, отсутствие политики по temperature и внешняя зависимость от durability layer.

## 7. Что использовать в дипломе
- Роль paper в дипломе: `practical system paper` и инженерный baseline по hybrid replication+EC (не temperature-aware policy paper).
- Что paper даёт напрямую (можно использовать как факт): разделение `metadata/key -> replication`, `value -> EC`; механизм `xid + piggyback stable xid` для согласованного parity update; измеренные trade-off (`33%–46%` memory saving, `7–13 ms` preparation pause, recovery около `550MB/s` без клиентских запросов).
- Что в дипломе является нашей интерпретацией применимости: использовать Cocytus как опорную архитектуру перед добавлением temperature-driven выбора схемы избыточности и policy переходов между режимами.
- Где paper лучше использовать как ограничивающий baseline: при мелких/частых updates и metadata-heavy профиле выигрыш по памяти сжимается, а CPU cost write-path растёт.
- Что нельзя переносить без оговорок: утверждения об универсальной эффективности для любых workload/value-size и любые выводы про tiering/temperature orchestration (этого в статье нет).

## 8. Полезные цитаты
- "Cocytus incurs low overhead for latency and throughput, can tolerate node failures with fast online recovery, yet saves 33% to 46% memory compared to PBR when tolerating two failures."
  Стр.: 167
  Зачем нужна: компактная формула эмпирического вклада статьи (производительность, recovery, память).
- "Cocytus separates data from metadata and leverages a hybrid scheme: metadata and key are replicated using primary-backup while values are erasure coded."
  Стр.: 169
  Зачем нужна: точное определение гибридной архитектуры, пригодное для постановки baseline в дипломе.
- "The preparation phase blocks key/value requests for a very short time. According to our evaluation, the blocking time is only 7ms to 13 ms even under a high workload."
  Стр.: 171
  Зачем нужна: подтверждает, что даже при online recovery есть короткое синхронизирующее окно, которое надо учитывать в системном дизайне.

## 9. Термины и понятия
- `Coding group`: группа из `K` data processes и `M` parity processes, базовая единица отказоустойчивости Cocytus.
- `Data process`: процесс, хранящий value-данные и обслуживающий клиентские операции.
- `Parity process`: процесс, хранящий parity values и реплики metadata/key.
- `xid`: монотонный идентификатор запроса на data process (логические часы для консистентности).
- `Stable xid`: последняя гарантированно распространённая на все parity процессы точка консистентности.
- `Recovery unit`: единица online recovery размером `4KB`.
- `Interleaved layout`: размещение data/parity процессов разных групп на каждом узле для балансировки и распределённого recovery.
- `Deterministic allocator`: аллокатор, который обеспечивает одинаковый memory layout между процессами.
- `Pre-allocation request`: механизм сохранения одинакового порядка аллокации во время асинхронного recovery.
- `Miss bit`: пометка блоков при восстановлении parity process для корректного catch-up.

## 10. Итог в одном абзаце
Cocytus - это сильный практический baseline по гибриду replication и erasure coding для in-memory KV-store. Статья показывает, что разделение по типу данных (metadata/key против values) позволяет заметно снизить memory overhead относительно PBR, не ломая сервис при отказах благодаря online recovery. Для диплома особенно ценны два элемента: целостная архитектура coding groups с interleaving и протокол консистентных parity updates через xid/piggyback. Эксперименты подтверждают выигрыш по памяти и приемлемую цену по производительности, но также честно показывают пределы при update-intensive профилях и metadata-heavy сценариях. Работа не является temperature-aware политикой и не закрывает весь lifecycle migration/control plane на уровне production-оркестрации. Поэтому её корректно использовать как инженерный baseline, который в дипломе дополняется temperature-driven выбором схемы и политикой переходов.
