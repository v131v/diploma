# EC-Store: Bridging the Gap Between Storage and Latency in Distributed Erasure Coded Systems

## 1. Библиографическая карточка
- ID: `ec_store_icdcs_2018`
- Авторы: Michael Abebe, Khuzaima Daudjee, Brad Glasbergen, Yuanfeng Tian
- Год: 2018
- Тип: conference paper
- Ссылка: https://cs.uwaterloo.ca/~mtabebe/publications/abebeECStore2018ICDCS.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + `related work` + `baseline`
- Для каких разделов диплома полезен: постановка проблемы, related work по latency-aware EC, архитектура EC-слоя, экспериментальная часть
- Какой главный вопрос диплома помогает закрыть: как снизить latency в erasure-coded storage, не возвращаясь к полной репликации и не теряя storage efficiency
- Что важно сразу зафиксировать: это системный paper про EC access/placement, а не про temperature-aware switching между replication и EC

## 3. Карта статьи
| Раздел paper | О чём раздел | Насколько важен для диплома |
|---|---|---|
| `1. Introduction` | Мотивация: почему в EC-стеке латентность определяется retrieval, а не decoding | Очень важен |
| `2. Erasure Coded Storage and Fault Tolerance` | База по replication, RS-кодам, fault tolerance и storage overhead | Очень важен |
| `3. Motivating Example` | Как stragglers и co-access patterns ломают latency и почему нужна data movement | Критически важен |
| `4. Dynamic Data Access and Movement Strategies` | Cost model, ILP для access plan, эвристики movement и late binding | Критически важен |
| `5. EC-Store: Architecture and Implementation` | Состав системы, control plane, data plane и сервисы EC-Store | Критически важен |
| `6. Experimental Evaluation` | YCSB, Wikipedia, failures, block size, resource consumption | Очень важен |
| `7. Related Work` | Сопоставление с replication-aware и placement-aware системами | Важен |
| `8. Conclusion` | Сжатое резюме вклада и ограничений | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: задаёт центральную проблему paper - у erasure-coded storage основная цена доступа часто сидит в distributed retrieval и stragglers, а не в decoding.
- Ключевые тезисы / аргументы: replication даёт быстрый single-site access, но хранит больше данных; EC экономит место, но требует чтения нескольких chunks и страдает от slow site effects.
- Важные механизмы / модель / архитектура: авторы сразу вводят идею динамического `data access` и `data movement`, чтобы выбирать чанк-план с минимальной ожидаемой задержкой.
- Что отсюда брать в диплом: хорошая мотивация для раздела про latency-aware design внутри EC-слоя.

### 4.2 Erasure Coded Storage and Fault Tolerance
- Что делает этот раздел: формально поясняет, как EC обеспечивает fault tolerance и чем он отличается от replication по стоимости хранения и чтения.
- Ключевые тезисы / аргументы: MDS-код позволяет восстановить блок из any `k` chunks; при этом data retrieval для EC требует нескольких parallel requests и завершения по slowest chunk.
- Важные механизмы / модель / архитектура: RS(k, r), fault tolerance через `k + r` chunks, storage overhead `(k+r)/k`, сравнение с replication как базовым trade-off.
- Что отсюда брать в диплом: этот раздел удобно использовать для аккуратной постановки компромисса `storage efficiency vs. latency`.

### 4.3 Motivating Example
- Что делает этот раздел: показывает на простом примере, что chunk placement и access choice меняют latency не меньше, чем сам код.
- Ключевые тезисы / аргументы: один перегруженный site становится straggler-ом; если выбрать другой chunk на менее нагруженном site, latency падает даже без смены redundancy scheme.
- Важные механизмы / модель / архитектура: co-located access, load-aware access, chunk movement для уменьшения числа accessed sites и улучшения balance.
- Что отсюда брать в диплом: это сильная иллюстрация того, что placement и access policy - полноценные системные рычаги, а не вспомогательные детали.

### 4.4 Dynamic Data Access and Movement Strategies
- Что делает этот раздел: формализует `cost model` для access и movement, а затем показывает, как из него получить практические стратегии.
- Ключевые тезисы / аргументы: data access cost складывается из site overhead и cost чтения chunks; data movement оценивается по ожидаемому выигрышу от изменения access cost и load balance.
- Важные механизмы / модель / архитектура: ILP для optimal access plan, эвристики для candidate movement plans, `late binding` как дополнительная, но более load-heavy альтернатива.
- Что отсюда брать в диплом: это главный методический блок статьи, из которого можно брать формулировки для cost-aware placement и access planning.

## 5. Архитектура и устройство системы / метода
- EC-Store - это полноценная distributed storage system, а не только алгоритм кодирования: архитектура разделена на `control plane` и `data plane`.
- `Data plane` состоит из site-local storage services, которые реально хранят chunks, обслуживают reads/writes и участвуют в fault recovery.
- `Control plane` включает metadata service, chunk placement service, statistics service и repair service; именно здесь принимаются решения о размещении, доступе и перемещении chunks.
- Client обращается к EC-Store через service API для `put`, `read` и `delete`; при записи система добавляет placement step, а при чтении сначала вычисляет access plan.
- `Chunk read optimizer` строит план чтения по функции `cost(C, Q)`, кеширует найденные решения и на cache miss использует greedy fallback, пока background ILP solver пересчитывает точный план.
- `Chunk mover` асинхронно выбирает block, source site и destination site по `∆(C, b, s, d)`, копирует chunk, обновляет metadata и может throttle-ить скорость миграции, чтобы не создавать лишнюю нагрузку.
- `Statistics service` собирает CPU utilization, I/O load, number of stored chunks и co-access statistics; из этих данных получаются параметры `o_j`, `m_j` и `λ_b,i`.
- `Repair service` опрашивает storage services, помечает недоступные sites, ждёт 15 минут и затем reconstructs chunks, используя ту же логику placement и movement.
- Реализация написана на C++, использует Apache Thrift для RPC, Jerasure 2.0 для encoding/decoding и SCIP как ILP solver.
- Для типа paper это адекватная и ясная архитектура: система действительно описана как набор сервисов и потоков решения, а не как абстрактный метод без runtime.
- Ограничение источника: EC-Store явно не является temperature-aware policy engine; он оптимизирует latency и load-aware placement внутри EC-стека, но не решает задачу выбора между replication, hybrid redundancy и EC по температуре данных.

### 4.5 Experimental Evaluation
- Что делает этот раздел: проверяет, что выигрыш по latency достигается именно за счёт access/movement стратегии, а не за счёт скрытых допущений.
- Ключевые тезисы / аргументы: на YCSB-E и Wikipedia workload наиболее заметный вклад в response time даёт retrieval chunks; decoding и metadata access вторичны.
- Важные механизмы / модель / архитектура: сравнение базовых `R` и `EC` с `EC+C`, `EC+C+M`, `EC+LB` и `EC+C+M+LB`; отдельный анализ block size, failures и resource consumption.
- Числа, метрики, результаты: `EC+C+M` даёт около `40%` improvement in latency over EC и `20%` over replication на YCSB 100 KB; на Wikipedia reduction составляет `40%` over EC, `20%` over replication и `17%` over late binding; при 1 MB blocks выигрыш достигает почти `50%` over EC, `27%` over R и `21%` over `EC+LB`.

### 4.6 Related Work and Conclusion
- Что делает этот раздел: помещает EC-Store в контекст replication-aware, placement-aware и late-binding подходов.
- Ключевые тезисы / аргументы: авторы показывают, что их система объединяет load-aware access, co-location и dynamic movement, а не только одну из этих идей по отдельности.
- Важные механизмы / модель / архитектура: важен контраст с системами, где placement делается по одной статистике или где late binding добавляет лишние requests и нагрузку на storage sites.
- Что отсюда брать в диплом: аккуратную формулировку, что EC-Store - это baseline по latency-aware EC, но не complete lifecycle policy для temperature-driven storage.

## 6. Сквозные выводы по статье
- Главная проблема EC-Store - не decoding, а `distributed retrieval latency`, особенно при skewed access и concurrent clients.
- Основной выигрыш появляется тогда, когда система одновременно улучшает `access planning`, `co-location` и `load balance`; каждая из этих частей по отдельности даёт меньший эффект.
- `Late binding` действительно может уменьшать response time, но платит за это дополнительными requests и нагрузкой на storage services; EC-Store пытается получить похожий эффект более "дешёвым" способом.
- Экспериментально система показывает сильный latency gain при небольшом overhead: около `0.3%` дополнительного пространства для статистики и менее `0.1%` network overhead для movement.
- Для диплома это хороший аргумент, что внутри EC-слоя нужно проектировать не только codec choice, но и policy for access and placement.

## 7. Что использовать в дипломе
- Использовать как baseline для `latency-aware EC layer`, где placement и access plan выбираются по workload statistics.
- Брать как аргумент, что `stragglers` и `load imbalance` могут быть важнее, чем сам код, если речь идёт о пользовательской latency.
- Опереться на cost model и ILP/heuristic split для описания собственного decision layer, если в дипломе понадобится формализовать access planning.
- Использовать experimental metrics: response time breakdown, tail latency, per-site load, resource consumption, block size sensitivity, failure robustness.
- Не переносить из этой работы temperature-aware switching между replication и EC: paper этого не решает и не моделирует.

## 8. Полезные цитаты
- "data retrieval times dominate overall response times."
  Стр.: 1
  Зачем нужна: коротко фиксирует главный системный вывод статьи.
- "EC-Store is designed to take advantage of workloads that contain multi-item retrievals."
  Стр.: 2
  Зачем нужна: показывает, на каком классе workload система получает лучший эффект.
- "EC-Store used only an additional 0.3% of the space needed to store data."
  Стр.: 9
  Зачем нужна: подтверждает, что системный overhead у подхода невелик.
- "EC-Store reduces the average time to retrieve data by nearly 50% when compared to standard erasure coding techniques, and 30% compared to replication."
  Стр.: 10
  Зачем нужна: даёт сильную финальную формулировку результата статьи.

## 9. Термины и понятия
- `Straggler` - медленный chunk или site, который задерживает завершение distributed read.
- `Late binding` - стратегия, в которой запрашивают дополнительные chunks и ждут только первые `k` ответов.
- `Data access plan` - набор chunks и sites, выбранный для конкретного запроса.
- `Chunk mover` - фоновый компонент, который переносит chunks между sites ради co-location и load balance.
- `Statistics service` - сервис, собирающий load и access statistics для принятия решений.
- `Load balance factor` - величина, показывающая отклонение нагрузки site от среднего уровня.
- `Access correlation` - статистика совместного чтения блоков, используемая для выбора movement plans.

## 10. Итог в одном абзаце
EC-Store показывает, что в erasure-coded storage узкое место часто находится не в самом decoding, а в том, как система выбирает chunks, сайты и моменты перемещения данных. Авторы предлагают cost-aware access planning и load-aware chunk movement, реализуют их как полноценную систему с control plane, data plane и набором сервисов и получают заметное снижение latency при небольшом overhead. Для диплома это полезный системный baseline по latency-aware EC: он хорошо объясняет, почему placement, access patterns и tail latency нужно учитывать внутри EC-слоя. При этом paper не решает temperature-aware switching между replication и EC, поэтому его стоит использовать как building block, а не как целевую гибридную policy.
