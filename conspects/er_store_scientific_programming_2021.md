# ER-Store: A Hybrid Storage Mechanism with Erasure Coding and Replication in Distributed Database Systems

## 1. Библиографическая карточка
- ID: `er_store_scientific_programming_2021`
- Авторы: Zijian Li, Chuqiao Xiao
- Год: 2021
- Тип: journal article
- Ссылка: https://doi.org/10.1155/2021/9910942
- Исходный файл: `sources/files/Scientific Programming - 2021 - Li - ER‐Store  A Hybrid Storage Mechanism with Erasure Coding and Replication in.pdf`

## 2. Зачем источник нужен для диплома
- Роль источника: `practical system paper` и baseline по hybrid storage в распределённой БД.
- Для каких разделов диплома полезен: постановка проблемы, архитектура системы, temperature-aware policy, experimental baseline и related work.
- Главный вопрос, который он помогает закрыть: как связать температуру данных с выбором между replication и EC так, чтобы не убить update path и сохранить приемлемый access performance.
- Что важно заранее зафиксировать: это paper про CBase и tablet-oriented distributed database, а не про универсальное object storage.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Важность |
|---|---:|---|---|
| `1. Introduction` | 1-2 | Почему replication и EC по отдельности не решают задачу для hot/warm/cold данных | Критически важен |
| `2. Background` | 2-3 | Репликация, erasure coding и архитектура CBase | Очень важен |
| `3. The Hybrid Storage Mechanism` | 3-6 | ER-Store design, data temperature recognition и data temperature conversion | Критически важен |
| `4. Regularly Updated` | 6-8 | Re-encoding и incremental encoding для parity update | Очень важен |
| `5. Evaluation and Comparisons` | 8-12 | Storage efficiency, performance, update efficiency и recovery | Критически важен |
| `6. Conclusions` | 12 | Краткий итог и позиционирование результата | Умеренно важен |

## 4. Подробный конспект по разделам

### 4.1 Introduction
- Что делает этот раздел: формулирует базовую проблему, что replication слишком дорога по storage overhead, а EC слишком тяжела для частых обновлений.
- Ключевые тезисы / аргументы: данные в distributed systems имеют разную частоту доступа, поэтому одна redundancy scheme для всех tablets не оптимальна.
- Важные механизмы / модель / архитектура: вводится триада `hot / warm / cold` как основа будущей policy.
- Что отсюда брать в диплом: это хороший мотивационный старт для темы hybrid replication + EC на основе температуры данных.

### 4.2 Background
- Что делает этот раздел: разъясняет, почему replication и EC по отдельности дают плохой компромисс.
- Ключевые тезисы / аргументы: replication проста, но требует много места; EC экономичнее, но дороже по CPU, network I/O и update cost.
- Важные механизмы / модель / архитектура: paper кратко описывает `Replication`, `Erasure Coding` и `CBase` как исходную систему, на которой строится ER-Store.
- Что отсюда брать в диплом: полезный блок для объяснения, почему гибридная схема вообще нужна.

### 4.3 The Hybrid Storage Mechanism
- Что делает этот раздел: показывает, как ER-Store встраивается в CBase и как выбирается storage scheme для каждого tablet.
- Ключевые тезисы / аргументы: `hot` tablets хранятся в `3 replicas`, `warm` tablets - в `2 replicas + RS-code`, `cold` tablets - в `RS-code`.
- Важные механизмы / модель / архитектура: `RS` пересчитывает temperature, обновляет `RootTable`, строит `TCT` и отправляет таблицу конверсии в `CS`.
- Что отсюда брать в диплом: это главный системный вклад статьи, потому что policy прямо связана с конкретными компонентами CBase.

### 4.4 Regularly Updated
- Что делает этот раздел: объясняет, как обновлять parity при merge baseline data и incremental data.
- Ключевые тезисы / аргументы: re-encoding подходит для массовых обновлений, incremental encoding - для небольшого числа изменений в stripe.
- Важные механизмы / модель / архитектура: update path идёт через `UPS`, а parity updates выполняются на `CS` после передачи `ΔD`.
- Что отсюда брать в диплом: хороший пример разделения дешёвого и тяжёлого update path.

### 4.5 Evaluation and Comparisons
- Что делает этот раздел: проверяет storage efficiency, transaction performance, update efficiency и recovery efficiency.
- Ключевые тезисы / аргументы: hybrid scheme даёт заметный выигрыш на skewed workload, но проигрывает three replicas на uniform workload.
- Важные механизмы / модель / архитектура: эксперименты выполняются на CBase cluster из `10` PC servers с `sysBench`.
- Что отсюда брать в диплом: эмпирическое подтверждение того, что temperature-aware hybrid storage работает, но не бесплатен.

## 5. Архитектура и устройство системы / метода
- Назначение системы: ER-Store не заменяет CBase целиком, а добавляет к ней temperature-aware mechanism выбора схемы избыточности для tablets.
- Общая структура: система состоит из `RS` (`RootServer`), `UPS` (`UpdateServer`), `CS` (`ChunkServer`) и `MS` (`MergeServer`).
- Роль `RS`: хранит metadata, считает температуру tablet, обновляет `RootTable` и строит `TCT`.
- Роль `CS`: хранит baseline data, обслуживает чтение data tablets и применяет новую redundancy scheme после conversion.
- Роль `UPS`: принимает write/update operations, хранит incremental data в memtable и участвует в periodic merge.
- Роль `MS`: принимает SQL-запросы, парсит их и направляет в `CS` и `UPS`.
- Где лежат данные и метаданные: baseline data находятся в `CS`, incremental data - в `UPS`, а metadata о tablet-ах и схемах хранения - в `RS` внутри `RootTable`.
- Как проходит чтение: client sends request to `MS`, `MS` получает данные распределения от `RS`, затем обращается к нужному `CS`, после чего результаты возвращаются клиенту.
- Как проходит запись и update: client sends update to `MS`, `MS` отправляет операцию в `UPS`, incremental data пишутся в memory, а после merge `CS` и parity nodes обновляют data/parity blocks.
- Как определяется температура: в конце периода `CS` отправляют `RS` access frequency по tablets, после чего `RS` пересчитывает `T(tn)` по формуле на базе Newton-like cooling model и строит `TCT`.
- Как выбирается новая redundancy scheme: `TCT` сравнивает старый `TS` и новый класс температуры, после чего `CS` меняет `SS` в `RootTable` и перекодирует tablets.
- Как устроены режимы хранения: hot tablets получают `3 replicas`, warm tablets - `4+1` RS stripe, cold tablets - `6+2` RS stripe.
- Как устроено обновление parity: если обновляется мало tablets в stripe, выгоднее incremental encoding; если обновлений много, re-encoding.
- Что важно для диплома: архитектура paper ясно показывает, где принимается решение о temperature classification, где хранится metadata, и как data flow отделён от conversion flow.
- Ограничение архитектуры: решение завязано на CBase и tablet-oriented database design, поэтому не является готовым шаблоном для любого storage system без адаптации.

## 6. Сквозные выводы по статье
- ER-Store показывает, что hybrid storage может быть выгоднее простой replication, если данные действительно имеют skewed access pattern.
- Главный системный выигрыш достигается не только за счёт выбора EC для cold data, но и за счёт periodic conversion cycle, который не пересчитывает parity на каждом write.
- Температурная policy здесь дискретная и периодическая, а не непрерывная, поэтому её удобно реализовывать как batch decision mechanism.
- Узкое место гибридной схемы тоже видно честно: recovery у EC-based modes медленнее, чем у full replication, а uniform workload плохо подходит для такого дизайна.
- Вывод для диплома: гибридная схема должна оптимизироваться не только по storage overhead, но и по стоимости update/recovery transitions.

## 7. Что использовать в дипломе
- Использовать как baseline для формализации `hot / warm / cold` policy и periodic reclassification.
- Использовать как источник архитектурной логики: `RS` для metadata and temperature decision, `CS` для data/parity storage, `UPS` для incremental updates.
- Использовать численные результаты по storage efficiency, fault tolerance и update threshold как empirical evidence.
- Использовать как аргумент, что temperature-aware switching должно быть связано с отдельным low-cost conversion path, а не с полным переписыванием данных.
- Не переносить без оговорок CBase-specific детали в object storage или file system.

## 8. Полезные цитаты
- "divides data tablets into three types, cold, warm, and hot"
  Стр.: 1
  Зачем нужна: фиксирует саму трёхклассовую модель температуры данных.
- "ER-store is proposed, a hybrid storage mechanism for different data types"
  Стр.: 1
  Зачем нужна: коротко и точно фиксирует hybrid storage idea статьи.
- "the data temperature conversion table (TCT)"
  Стр.: 5
  Зачем нужна: показывает механизм периодической конверсии схем хранения.
- "the experimental results show that it can save 14.6%–18.3% of the storage space"
  Стр.: 1
  Зачем нужна: даёт компактный численный итог по storage savings.
- "the incremental encoding algorithm performed better than the recoding algorithm when the number of update tablets was less than 3"
  Стр.: 11
  Зачем нужна: фиксирует порог, при котором выгоднее incremental update.

## 9. Термины и понятия
- `Tablet` - единица данных, которую ER-Store классифицирует по температуре.
- `RootTable` - таблица метаданных в `RS`, где хранятся `SS`, `t`, `TS`, `RI`, `Tidsum` и `v`.
- `RS` - `RootServer`, который считает температуру tablets и управляет conversion policy.
- `CS` - `ChunkServer`, где лежат baseline data и redundant chunks.
- `UPS` - `UpdateServer`, который принимает incremental writes и хранит их в memtable.
- `MS` - `MergeServer`, который парсит SQL и маршрутизирует запросы.
- `SS` - поле схемы хранения: `0` для `3 replicas`, `1` для `2 replicas + RS-code`, `2` для `RS-code`.
- `TS` - temperature status, то есть класс температуры таблетки.
- `RI` - redundant information, то есть расположение replicas или stripe fragments.
- `TCT` - temperature conversion table, таблица перевода tablets между storage modes.
- `Incremental encoding` - обновление parity через delta данных, когда изменяется небольшое число tablets.
- `Re-encoding` - полный пересчёт parity stripe при массовых обновлениях.

## 10. Итог в одном абзаце
ER-Store - это полезный baseline для диплома, потому что он показывает, как temperature-aware policy можно встроить в distributed database system и связать с конкретными схемами хранения для hot, warm и cold данных. Работа не ограничивается общей идеей hybrid storage: она предлагает регулярный пересчёт температуры, таблицу конверсии схем и два разных алгоритма обновления parity, чтобы уменьшить потери от erasure coding на update path. Для темы диплома особенно важно, что ER-Store прямо подтверждает практичность многоуровневой схемы `replication + hybrid + EC`, а также показывает, что компромисс между storage efficiency и transaction performance можно формализовать через температуру данных. При этом источник остаётся привязанным к CBase и tablet-oriented database architecture, поэтому в дипломе его лучше использовать как architecture baseline и empirical evidence, а не как готовое универсальное решение. Его сильная сторона - ясная трёхклассная policy и измеримый выигрыш по storage space; слабая сторона - более медленное восстановление по сравнению с полной репликацией и зависимость от периодической conversion policy.
