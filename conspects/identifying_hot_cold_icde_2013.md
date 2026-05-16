# Identifying Hot and Cold Data in Main-Memory Databases

## 1. Библиографическая карточка
- ID: `identifying_hot_cold_icde_2013`
- Авторы: Justin J. Levandoski, Per-Ake Larson, Radu Stoica
- Год: 2013
- Тип: conference paper
- Ссылка: https://www.microsoft.com/en-us/research/wp-content/uploads/2013/04/ColdDataClassification-icde2013-cr.pdf

## 2. Зачем этот источник нужен для диплома
Источник даёт рабочее и измеримое определение температуры данных на уровне записи: частота доступа оценивается offline по журналу обращений через exponential smoothing. Для темы гибридного EC+репликации это полезно как база для слоя temperature classification: paper показывает, как отделить классификацию от критического пути OLTP и какую точность/overhead можно ожидать при sampling.

## 3. Карта статьи
| Раздел paper | Что в разделе | Зачем это важно для диплома |
| --- | --- | --- |
| Abstract | Постановка задачи hot/cold classification в main-memory OLTP, идея логирования доступов и offline-оценки частот, заявка на sub-second анализ 1B доступов | Короткое формальное ядро метода и ключевые claim’ы по точности/скорости |
| I. Introduction | Мотивация: skew доступа, экономика DRAM vs flash, почему inline caching дорог; вклад статьи | Обоснование, зачем вообще нужен внешний temperature classifier |
| II. Preliminaries (A-E) | Контекст Hekaton; место работы в Project Siberia; схема логирования; формула exponential smoothing; sampling | Декларирует границы применимости и базовые строительные блоки метода |
| III. Classification Algorithms (A-B) | Serial forward и serial backward алгоритмы; upper/lower bounds; accept threshold; условия ранней остановки | Основа алгоритмического ядра классификации hot/cold |
| IV. Parallel Classification (A-B) | Параллельные версии forward/backward; controller-worker схема для backward-parallel | Практически важно для запуска классификации на больших логах |
| V. Experiments (A-D) | Сравнение hit rate (ES vs LRU-2/ARC), влияние sampling, скорость и память алгоритмов, ограничения | Нужные численные аргументы для выбора метода и ожиданий по overhead |
| VI. Related Work | Main-memory OLTP engines, caching, top-k, сравнение с HyPer | Корректное позиционирование работы как classification-component paper |
| VII. Conclusion | Итог: точная и быстрая offline-классификация при низком overhead | Краткий итог для формулировки takeaway в дипломе |
| Appendix A-E | Корректность удаления записей, сходимость threshold search, детали TightenBounds, распределение LRU-k, n-minute rule | Полезно для углубления формальных аргументов, но не основная линия диплома |

## 4. Подробный конспект по разделам
### 4.1 I. Introduction
- Проблема: в OLTP-нагрузках есть выраженный skew, поэтому небольшая доля записей формирует hot working set, а остальная масса данных редко запрашивается.
- Экономический мотив: cold данные выгоднее держать на secondary storage (например, flash), чем в дорогой DRAM.
- Почему не «просто кэш»: поддержка inline-структур на каждом доступе даёт ощутимый overhead (авторы приводят пример около 25% CPU overhead даже для простого LRU queue в прототипе).
- Цель: быстро и точно выделять hot set из логов обращений, не встраивая тяжёлую логику в критический путь транзакций.

### 4.2 II. Preliminaries
- Задача формализована как выбор `K` самых «горячих» записей по оценённой частоте доступа; эти записи остаются в памяти, остальные считаются cold.
- Контекст выполнения: Hekaton (memory-optimized OLTP engine в SQL Server, record-centric организация без page-centric дизайна).
- Project Siberia включает 4 направления, но paper покрывает только `cold data classification`; migration/storage/access reduction описаны как out of scope.
- Логирование: система пишет наблюдения доступа к записям в отдельный access log с time-slice разметкой; анализ выполняется offline.
- Оценка частоты: exponential smoothing с параметром `alpha`; это выбранный компромисс простоты и точности.
- Sampling: логируется только часть обращений, чтобы снизить runtime overhead на прод-системе.

### 4.3 III. Classification Algorithms
- Forward algorithm: один проход лога вперёд, поддержка оценки частоты для записей, затем выбор top-`K`.
- Ограничения forward: нужен полный проход и память пропорционально числу уникальных `record id` в логе.
- Backward algorithm: проход лога в обратную сторону с расчётом upper/lower bounds оценок частоты; записи вне контеншна удаляются.
- Введён `accept threshold`: новые записи старее порога можно сразу отбрасывать, что уменьшает память.
- Главная идея backward-подхода: возможна ранняя остановка до начала лога, когда остаётся ровно `K` кандидатов с гарантией корректности классификации.

### 4.4 IV. Parallel Classification
- Parallel forward: распараллеливание по partition’ам и последующая агрегация частичных оценок.
- Parallel backward: controller + workers, где workers ведут локальные bounds по partition’ам, а controller выполняет threshold search.
- Фазы backward-parallel:
- `Initialization`: получить локальные `k/n`-границы и счётчики верхних/нижних bound.
- `Threshold search`: итеративно подбирать общий порог `Q`, вызывать `ReportCounts` и при необходимости `TightenBounds`.
- `Finalization`: собрать итоговый hot set по записям, прошедшим порог.

### 4.5 V. Experiments
- Setup: C/C++, 1B обращений, 1M записей, распределения Zipf и TPC-E; стандартно time slice = 10k обращений.
- Точность классификации: exponential smoothing (ES) стабильно ближе к «perfect classifier», чем LRU-2 и ARC; loss in hit rate обычно <1%.
- Sampling 10%: примерно 90% сокращение логирующей активности при около 2.5% падении hit rate (как trade-off).
- Скорость: backward-parallel показывает лучшие времена; для ряда режимов достигается sub-second классификация на 1B log.
- Память: backward/backward-parallel заметно ближе к минимально возможному overhead, чем forward и особенно forward-parallel.

### 4.6 V-D Discussion (ограничения)
- Метод не рассчитан на детектирование быстрых, краткоживущих скачков доступа.
- При слишком низкой доле sampling точность классификации может падать до неприемлемого уровня.

### 4.7 VI. Related Work
- Авторы сравнивают подход с классическими cache-policy (LRU, LRU-k, ARC и др.) и объясняют, почему offline logging + ES лучше подходит под их ограничения.
- Отдельно обсуждается отличие от HyPer: там hot/cold выявляется на уровне VM page, здесь на уровне record.

### 4.8 VII. Conclusion
- Итог paper: offline-классификация по log-access + ES даёт высокую точность при низком runtime overhead.
- Практический вывод: backward-алгоритмы (особенно parallel) дают лучший баланс времени и памяти для больших логов.

## 5. Архитектура и устройство системы / метода
- Это не paper про самостоятельную production-систему с детально описанным runtime, а про компонент cold-data classification внутри более широкой инициативы `Project Siberia` для Hekaton.
- Базовый контекст - `Hekaton`, memory-optimized OLTP engine, интегрированный в SQL Server; он record-centric и работает без page-based storage abstractions.
- Внутри `Project Siberia` авторы явно называют четыре направления: cold data classification, cold data storage, cold data access and migration mechanisms, cold storage access reduction. Эта статья покрывает только первое направление, а остальные остаются вне scope.
- Runtime-поток выглядит так: worker thread во время обычной обработки запросов собирает record access information, копирует его в большие shared buffers и flush-ит их асинхронно; затем offline analyzer читает лог и оценивает частоты.
- Для оценки hot set используется либо serial forward/backward scan, либо backward-parallel variant, где controller делит лог по hash(record id), workers считают локальные статистики, а затем результаты сводятся в итоговый hot set.
- Это адекватная архитектура для paper такого типа: она достаточна, чтобы понять data path, logging path и classification path, но она не даёт полной архитектуры миграции cold data в secondary storage.

## 6. Сквозные выводы по статье
- Offline-классификация по access log даёт способ измерять температуру без тяжёлого inline-caching в транзакционном пути.
- Exponential smoothing в этом контексте практически выигрывает по точности у LRU-2/ARC и обеспечивает близость к «perfect» ранжированию hot set.
- Backward-подход критически важен для производительности: bounds + ранняя остановка уменьшают и время, и память.
- Sampling управляет компромиссом accuracy/overhead: заметное снижение операционной нагрузки возможно при умеренной потере hit rate.
- Статья решает задачу `identification`, но не закрывает storage/migration/replication/EC policy; это нужно добавлять отдельными источниками.

## 7. Что использовать в дипломе
- Напрямую из paper:
- Определение температуры данных через оценку частоты доступа по логу (record-level hot/cold classification).
- Архитектурный принцип «вынести классификацию из критического пути» через offline analysis и sampling.
- Практические baseline-цифры по точности и overhead (ES vs LRU-2/ARC, эффект 10% sampling).
- Наша интерпретация применимости:
- Использовать такой classifier как вход в policy-движок выбора избыточности (репликация для hot, EC для colder классов).
- Использовать пороговую/ранговую логику `top-K` как часть temperature-to-redundancy transition policy.
- Роль источника в структуре диплома:
- `theoretical foundation` для метрики температуры и методики её оценки.
- `related work / baseline` для сравнения с более «storage-aware» работами, где уже есть миграция и режимы избыточности.
- Честные ограничения при переносе:
- Paper не описывает распределённую storage-архитектуру, placement parity/replicas, metadata-plane и write/update/repair pipeline.
- Поэтому его нельзя использовать как готовый дизайн гибридной EC+replication системы, только как основу temperature classification.

## 8. Полезные цитаты
- "log record accesses"
  Стр.: 1
  Зачем нужна: фиксирует базовую идею офлайн-сбора наблюдений вместо inline caching.
- "loss in hit rate below 1%"
  Стр.: 8
  Зачем нужна: показывает, что exponential smoothing даёт очень точную классификацию hot set.
- "2.5% drop in hit rate"
  Стр.: 9
  Зачем нужна: хороший численный аргумент в пользу sampling и уменьшения overhead.
- "sub-second time"
  Стр.: 1
  Зачем нужна: подчёркивает, что классификация достаточно быстрая для регулярного запуска.
- "not designed to detect rapid, short-lived changes"
  Стр.: 9
  Зачем нужна: честно фиксирует ограничение метода и помогает не переносить его на быстро меняющуюся температуру.

## 9. Термины и понятия
- `Hot data`: записи, которые часто запрашиваются и должны оставаться в памяти.
- `Cold data`: записи, к которым обращаются редко; кандидат на перенос в более дешёвое хранилище.
- `Lukewarm data`: промежуточный по частоте класс записей между hot и cold, упомянутый в мотивации.
- `Exponential smoothing`: метод оценки частоты доступа по истории обращений с затуханием старых наблюдений.
- `Sampling`: запись только части обращений, чтобы уменьшить overhead логирования.
- `Hot set`: `K` записей с наибольшей оценённой частотой доступа.
- `Hekaton`: memory-optimized OLTP engine, который служит контекстом для работы.
- `Project Siberia`: прототип framework для автоматической миграции cold records в более дешёвое хранилище.

## 10. Итог в одном абзаце
Это полезный источник для части диплома, где нужно формально определить hot/cold-классификацию и объяснить, как её измерять с минимальным overhead. Работа показывает, что частоту обращений можно оценивать офлайн по логам, а exponential smoothing даёт точные и быстрые оценки для выделения hot set. Для диплома особенно важно, что авторы не полагаются на абстрактную интуицию, а связывают классификацию с наблюдаемой частотой доступа и порогом `K`. Хотя paper не относится напрямую к erasure coding, он хорошо поддерживает аргументацию о том, почему схема хранения или миграции может зависеть от температуры данных. Его удобно использовать для обоснования batch-классификации, sampling и порогов миграции между режимами хранения. Главное ограничение в том, что работа про main-memory OLTP, поэтому её идеи нужно адаптировать под distributed storage и EC-переходы.
