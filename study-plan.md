# Упорядоченный план изучения литературы

Связанные документы:

- [README](./readme.md)
- [Формализованный бриф](./formal-brief.md)
- [Корпус бакалаврских ВКР](./examples/meta.json)
- [@conspect-writer](./.codex/agents/conspect-writer.toml)
- [@conspect-reviewer](./.codex/agents/conspect-reviewer.toml)

## Цель плана

Цель чтения не в том, чтобы последовательно прочитать все статьи, а в том, чтобы быстро собрать:

- формальную постановку проблемы;
- базовые альтернативы для сравнения;
- архитектурные идеи для диплома;
- набор метрик и аргументов для experimental section.

План ниже обновлён под текущий корпус из `27` источников в [sources/meta.json](./sources/meta.json).
Вспомогательный корпус смежных бакалаврских ВКР собран отдельно в [examples/meta.json](./examples/meta.json) и может использоваться для поиска соседних тем, формулировок и практических направлений.

Он разбит на:

- `ядро`: без него не стоит писать постановку задачи;
- `расширение`: нужно для сильного related work;
- `evaluation`: нужно для experimental section и метрик.

## Принцип порядка

Порядок чтения выстроен так:

1. Сначала понять общую картину `erasure coding` в storage systems.
2. Затем разобрать две ключевые линии диплома: `Morph` и `HSM`.
3. После этого изучить теоретическую базу переходов между кодами.
4. Затем добрать смежные hybrid- и demand-aware работы: `ER-Store`, `HyRES`, `Zebra`, `ELECT`.
5. Потом добрать production- и systems-context: `f4`, `EC-Store`, `HeART`, `RapidRAID`.
6. В конце отдельно закрыть `evaluation`: benchmarking review, метрики и тестовые сценарии.

## Этап 1. Построить общую карту области

### 1. A Survey of the Past, Present, and Future of Erasure Coding for Storage Systems

- Зачем читать: это лучший старт для входа в тему без потери контекста.
- Что выписать: типы кодов, основные trade-off, какие метрики приняты в системных работах.
- Результат: короткая карта области на 1 страницу.

### 2. Erasure Coding in Windows Azure Storage

- Зачем читать: это классическая практическая работа про LRC и реальный production storage.
- Что выписать: зачем нужен locality, как EC влияет на repair и storage overhead.
- Результат: понимание, почему plain RS недостаточен для практических систем.

### 3. XORing Elephants: Novel Erasure Codes for Big Data

- Зачем читать: даёт фундамент для понимания repair-efficient codes и исторического контекста.
- Что выписать: trade-off между repair cost, storage overhead и locality.
- Результат: база для раздела про эволюцию кодов и motivation.

### 4. Towards Benchmarking Erasure Coding Schemes in Object Storage System: A Systematic Review

- Зачем читать: это не ядро идеи диплома, а быстрый способ заранее увидеть, какими метриками обычно меряют EC в object storage.
- Что выписать: upload/download/delete latency, waiting time, fault tolerance, fragment size, типы testbed'ов.
- Результат: заготовка для experimental section ещё до чтения всех primary papers.

## Этап 2. Разобрать две опорные линии диплома

### 5. HSM: A Hybrid Storage Method Based on the Heat of Data and Global Disk Space Utilization

- Зачем читать: это прямой baseline для temperature-aware storage в твоей НИР.
- Что выписать: как считается температура данных, как используются пороги, как учитывается заполненность дисков.
- Результат: черновик раздела про temperature-aware storage и ограничения бинарной классификации.

### 6. Morph: Efficient File-Lifetime Redundancy Management for Cluster File Systems

- Зачем читать: это главный системный источник для идеи жизненного цикла данных и дешёвых переходов между схемами.
- Что выписать: hybrid redundancy, transcode-efficient pipeline, block placement, эксплуатационные метрики.
- Результат: черновик основного архитектурного вдохновения для диплома.

## Этап 3. Закрыть ближайший related work по hybrid storage

### 7. ER-Store: A Hybrid Storage Mechanism with Erasure Coding and Replication in Distributed Database Systems

- Зачем читать: это смежный baseline по hybrid storage.
- Что выписать: как совмещаются репликация и EC, что авторы считают выигрышем, где ограничения по обновлениям и CPU cost.
- Результат: материал для related work и сравнения с твоим подходом.

### 8. HyRES: A Hybrid Replication and Erasure Coding Approach to Data Storage

- Зачем читать: это современная смежная работа по гибридной избыточности.
- Что выписать: какие гибридные схемы они предлагают, как сравнивают storage cost, file loss probability и repair traffic.
- Результат: ещё один сильный related work, который помогает показать, чем твой подход отличается от “просто hybrid storage”.

## Этап 4. Понять теоретическую базу переходов между кодами

### 9. Convertible Codes: Enabling Efficient Conversion of Coded Data in Distributed Storage

- Зачем читать: это основная теоретическая работа для формализации дешёвой перекодировки.
- Что выписать: что такое conversion cost, при каких параметрах переходы выгодны, какие ограничения накладываются на коды.
- Результат: теоретическая база для критерия перехода между схемами.

### 10. Locally Repairable Convertible Codes with Optimal Access Costs

- Зачем читать: это продолжение темы convertible codes с акцентом на локальный ремонт.
- Что выписать: как совмещаются repair locality и conversion efficiency.
- Результат: аргументы в пользу использования LRC в многошаговом пайплайне.

### 11. Practical Design Considerations for Wide Locally Recoverable Codes (LRCs)

- Зачем читать: помогает понять, какие LRC реально практичны в больших системах.
- Что выписать: выбор параметров wide LRC, practical constraints и deployment trade-offs.
- Результат: более реалистичный выбор финальных схем хранения.

## Этап 5. Изучить workload-aware и temperature-aware системные решения

### 12. Zebra: Demand-aware Erasure Coding for Distributed Storage Systems

- Зачем читать: показывает, как подстраивать EC под меняющийся спрос.
- Что выписать: как формализуется demand-aware policy и как выбираются схемы в зависимости от access pattern.
- Результат: мост между температурой данных и адаптивным управлением кодами.

### 13. ELECT: Enabling Erasure Coding Tiering for LSM-tree-based Storage

- Зачем читать: полезен как практический пример tiering-политики на уровне storage engine.
- Что выписать: как принимаются решения о переходе между уровнями и как это влияет на performance.
- Результат: материал для сравнения policy-level решений.
