# Towards Benchmarking Erasure Coding Schemes in Object Storage System: A Systematic Review

## 1. Библиографическая карточка
- ID: `benchmarking_ec_object_storage_fgcs_2025`
- Авторы: Rezuana Imtiaz Upoma, Md. Sadiqul Islam Sakif, Jannatun Noor
- Год: 2025
- Тип: systematic review
- Ссылка: https://www.sciencedirect.com/science/article/abs/pii/S0167739X24004862

## 2. Зачем этот источник нужен для диплома
Источник нужен как `benchmarking baseline` для оценки EC в объектном хранилище, а не как дизайн новой гибридной системы. Он полезен для диплома по трем практическим причинам:
- даёт набор метрик для экспериментов: `upload/download/delete time`, `waiting time`, показатели fault tolerance;
- показывает воспроизводимый контур эксперимента: `OpenStack Swift` + `local/remote testbed` + `SimEDC` + два датасета;
- фиксирует компромисс между time efficiency и отказоустойчивостью при разных RS-конфигурациях.

## 3. Карта статьи
| Раздел статьи | Что внутри | Зачем важно для конспекта |
|---|---|---|
| `1. Introduction` | Мотивация EC в DSS, акцент на time efficiency, заявленные contributions | Формулирует исследовательский фокус статьи |
| `2. Related Work` (`2.1`-`2.4`) | Обзор работ по storage systems, replication/deduplication, erasure coding и OpenStack Swift | Показывает, где авторы видят research gap |
| `3. Background` (`3.1`-`3.3`) | OpenStack Swift, RS в Swift, SimEDC | Даёт технический минимум для понимания методики |
| `4. Methodology` (`4.1`-`4.4`) | Выбор EC-техники, сборка testbed, выбор датасетов, pipeline анализа | Центральный раздел с экспериментальным дизайном |
| `5. Dataset` | Описание `MCSD-100` и использования `COCO-17` | Объясняет состав и типы данных для benchmark |
| `6. Experimental Evaluation` (`6.1`-`6.5`) | Setup, результаты по upload/download/delete, waiting time, SimEDC и scenario-based test | Основные численные и сравнительные результаты |
| `7. Experimental Findings` | Интерпретация trade-off, сравнение с related work, ограничения | Сводит результаты и границы применимости |
| `8. Conclusion and Future Work` | Итоги и направления future work | Готовые формулировки для ограничений и продолжения исследований |

## 4. Подробный конспект по разделам
### 4.1. Introduction
- Авторы обосновывают выбор EC как альтернативы replication в контексте storage overhead и fault tolerance.
- Основной акцент: для object storage важна не только экономия хранения, но и time efficiency операций I/O.
- Явно заявлен пробел: в обзоре литературы авторы не находят достаточного фокуса на benchmark time efficiency EC в терминах I/O-операций.
- Заявленные вклады: замеры `RS(5+3)`, `RS(7+5)`, `RS(10+4)` в Swift, анализ fault tolerance через SimEDC, использование `MCSD-100` и `COCO-17`.

### 4.2. Related Work (Section 2)
- Обзор сгруппирован по темам: storage systems, replication/deduplication, erasure coding.
- Авторы сопоставляют существующие работы по cost, repair, storage efficiency, availability и fault tolerance.
- На этом фоне формируют собственную задачу: сравнивать EC-схемы через измеримые I/O-метрики в object storage testbed.

### 4.3. Background (Section 3)
- `OpenStack Swift` описан как среда объектного хранения, где данные сегментируются и распределяются по узлам вместе с избыточностью.
- `Reed-Solomon` выбран как целевая EC-техника для экспериментов в Swift.
- `SimEDC` описан как дискретно-событийный симулятор для reliability-метрик (включая вероятность потери данных и эффективность repair).

### 4.4. Methodology (Section 4)
- Workflow статьи: выбор EC-техники -> сборка testbed -> выбор датасетов -> запуск и анализ экспериментов.
- Используются два окружения: `local testbed` и `remote testbed`.
- Для Swift задаются EC policies и rings, затем создаются контейнеры под соответствующие схемы.
- Для I/O-оценки выполняются upload/download/delete и фиксируется время.
- SimEDC добавлен как отдельный контур для оценки fault tolerance.

### 4.5. Dataset (Section 5)
- `MCSD-100`: собственный набор из 100 файлов разных типов (text/audio/image/video).
- `COCO-17`: внешний benchmark dataset; в экспериментах используется поднабор изображений.
- Датасеты нужны для сравнения поведения схем на разной размерности и типах файлов.

### 4.6. Experimental Evaluation (Section 6)
- `6.1`: описаны аппаратные параметры local/remote setup и скриптовый pipeline работы через Swift API.
- `6.2`: показаны сравнения upload/download/delete для `5+3`, `7+5`, `10+4` на разных диапазонах размеров.
- `6.3`: отдельно обсуждается waiting time и его рост с размером файлов.
- `6.4`: приведены результаты SimEDC по fault tolerance.
- `6.5`: добавлен scenario-based тест для проверки поведения при сбоях/потерях узлов и восстановления.

### 4.7. Experimental Findings (Section 7)
- Подчёркнут trade-off: при росте фрагментации (больше data+parity fragments) time efficiency ухудшается.
- Время ожидания растёт с размером файлов.
- Есть сравнительный блок с related work и отдельный блок ограничений исследования (включая ограничения testbed/simulator интеграции).

### 4.8. Conclusion and Future Work (Section 8)
- Итог статьи: рост фрагментации и размеров данных увеличивает processing/waiting time.
- Авторы предлагают направления future work: более масштабируемый testbed, работа с более крупными файлами, дополнительные подходы для повышения time efficiency.

## 5. Архитектура и устройство системы / метода
- Это не system paper в строгом смысле, поэтому здесь важно честно описывать не production-архитектуру, а benchmarking framework статьи.
- Основные компоненты метода:
  - `OpenStack Swift` выступает объектным хранилищем и местом проведения I/O-экспериментов;
  - `local testbed` и `remote testbed` позволяют сравнить поведение EC-схем в двух средах;
  - `EC policy files` задают число data и parity fragments, а также object segment size;
  - `Swift rings` распределяют фрагменты по узлам и задают layout кластера;
  - `SimEDC` оценивает fault tolerance по synthetic workloads;
  - `MCSD-100` и `COCO-17` обеспечивают набор файлов для измерения upload, download, delete и waiting time.
- Как устроен data flow:
  - сначала настраивается Swift и создаются EC policies для `5+3`, `7+5` и `10+4`;
  - затем строятся rings и EC containers для каждого policy;
  - после этого файлы загружаются, скачиваются и удаляются через Swift API;
  - результаты по времени собираются отдельно для local и remote testbed;
  - параллельно SimEDC выдаёт оценку reliability и repair-related metrics.
- Где находятся `data / parity / metadata`:
  - data и parity fragments физически раскладываются Swift ring builder по storage nodes;
  - метаданные о схеме хранятся в Swift configuration и policy definitions;
  - SimEDC не хранит реальные фрагменты, а моделирует поведение EC-схем на уровне симуляции.
- Что важно для интерпретации:
  - paper не предлагает automatic controller для выбора схемы;
  - не описывает отдельный scheduling subsystem;
  - архитектурная ценность работы состоит именно в воспроизводимом benchmark pipeline, а не в новом storage protocol.

## 6. Сквозные выводы по статье
- Статья подтверждает практический trade-off: более высокая фрагментация в выбранных RS-конфигурациях сопровождается ростом времени операций, прежде всего upload/download.
- Время ожидания увеличивается вместе с размером файлов, что авторы отдельно связывают с time efficiency системы.
- Оценка EC в object storage у авторов многокритериальная: I/O-время + fault tolerance (через SimEDC), а не только storage overhead.
- Работа методически сильнее как benchmark framework, чем как источник новой алгоритмики управления избыточностью.
- Ограничения зафиксированы самими авторами: сложности интеграции testbed и simulator, а также необходимость более масштабного testbed и дальнейших исследований по time efficiency.

## 7. Что использовать в дипломе
- Что paper даёт напрямую:
  - набор метрик для экспериментов (`upload/download/delete`, `waiting time`, fault tolerance);
  - структуру benchmark-постановки (`Swift` + `local/remote` + `RS policies` + `SimEDC` + два датасета);
  - подтверждение, что выбор схемы избыточности нельзя обосновывать только storage efficiency.
- Что является нашей интерпретацией применимости:
  - использование этой рамки как baseline для проверки гибридной системы `replication + EC` с температурной политикой;
  - перенос идеи многокритериальной оценки на сценарии переходов между схемами избыточности.
- Роль источника в дипломе:
  - `baseline` и `practical system paper` для experimental section;
  - `related work` по методике benchmark EC в object storage;
  - не источник готового control plane для temperature-aware оркестрации.

## 8. Полезные цитаты
- "As data volumes continue to rapidly increase, the time efficiency of the EC method becomes crucial in ensuring optimal system performance."
  Стр.: 1
  Зачем нужна: фиксирует, что авторы измеряют EC не только по объёму хранения, но и по времени выполнения.
- "However, none of the studies focus on finding time efficiency in terms of I/O operations of EC schemes."
  Стр.: 2
  Зачем нужна: показывает, какой именно research gap закрывает paper.
- "The graph reveals that upload time increases as the data file size grows for all three policies."
  Стр.: 8
  Зачем нужна: удобная дословная формулировка о цене увеличения числа фрагментов.
- "Our primary goal is to enhance time efficiency by minimizing the processing time for files."
  Стр.: 13
  Зачем нужна: фиксирует, что авторы связывают исследование с уменьшением времени обработки, а не только со storage savings.

## 9. Термины и понятия
- `OpenStack Swift`: объектное хранилище, на котором авторы измеряют EC-производительность.
- `RS(5+3) / RS(7+5) / RS(10+4)`: три сравниваемые конфигурации Reed-Solomon для оценки trade-off между временем, надёжностью и storage overhead.
- `SimEDC`: симулятор для оценки fault tolerance, probability of data loss и repair efficiency.
- `MCSD-100`: собственный набор данных авторов для benchmark-экспериментов.
- `COCO-17`: внешний benchmark dataset, который помогает сравнивать результаты на реальных типах файлов.
- `EC policy`: файл конфигурации, где задаются число data и parity fragments и размер сегмента объекта.
- `Swift ring`: механизм распределения фрагментов по узлам в OpenStack Swift.
- `Benchmarking framework`: связка из testbed, dataset и simulator, через которую paper измеряет time efficiency и fault tolerance.
- `waiting time`: время ожидания при передаче/обработке файлов; в этой статье это индикатор практической latency.

## 10. Итог в одном абзаце
Это полезный систематический обзор и benchmarking paper для диплома, потому что он задаёт практически удобный набор метрик и экспериментальную рамку для оценки erasure coding в object storage. В отличие от работ про гибридные схемы, здесь внимание сосредоточено на измеримости: какие RS-конфигурации брать, как сравнивать локальный и удалённый testbed, как учитывать upload/download/delete/waiting time и fault tolerance. Для этой темы источник особенно важен как baseline для experimental section и как аргумент, что выбор схемы хранения нельзя обосновывать только storage overhead. При этом он не даёт готовой temperature-aware политики и не описывает полноценную hybrid replication + EC архитектуру, поэтому его роль в дипломе должна быть вспомогательной. Если нужно, этот paper можно использовать как шаблон для раздела с методикой оценки собственной системы и для формулировки latency trade-off.
