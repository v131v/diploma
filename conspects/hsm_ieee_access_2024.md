# HSM: A Hybrid Storage Method Based on the Heat of Data and Global Disk Space Utilization

## 1. Библиографическая карточка
- ID: `hsm_ieee_access_2024`
- Авторы: Ying Song, Wenxuan Zhao, Yingai Tian, Bo Wang
- Год: 2024
- Тип: journal article
- Ссылка: https://doi.org/10.1109/ACCESS.2024.3382987
- Исходный файл: `sources/files/HSM_A_Hybrid_Storage_Method_Based_on_the_Heat_of_Data_and_Global_Disk_Space_Utilization.pdf`
- Extracted text: `sources/extracted/HSM_A_Hybrid_Storage_Method_Based_on_the_Heat_of_Data_and_Global_Disk_Space_Utilization.txt`

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` и прямой baseline для `temperature-aware hybrid storage`.
- Для каких разделов диплома полезен: постановка проблемы, архитектура, policy design, evaluation и related work.
- Что он помогает закрыть: как совместить температуру данных и глобальную заполненность дисков при выборе между replication и EC.
- Почему это важно именно для нашей темы: paper показывает, что простое правило `hot = replication, cold = EC` недостаточно, если система ещё должна учитывать ресурсное состояние кластера.
- Что важно заранее зафиксировать: HSM - это не абстрактная теория, а concrete policy с порогами, флагами и rack-aware layout, поэтому его удобно использовать как системный baseline, а не только как мотивационный пример.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Важность для диплома |
|---|---:|---|---|
| `1. Introduction` | 48630-48631 | мотивация, проблема fixed storage schemes, заявка на hybrid approach | Критически важен |
| `2. Background` | 48631-48632 | replication и Reed-Solomon как база метода | Очень важен |
| `3. Related Work` | 48632-48633 | сравнение с EC Fusion, ERP, URSA, HFPR и другими hybrid approaches | Очень важен |
| `4. The Design of HSM` | 48633-48635 | heat calculation, global utilization, placement layout, transition algorithm | Критически важен |
| `5. Performance Evaluation` | 48636-48638 | experimental setup, read/storage/traffic results, limitation note | Критически важен |
| `6. Conclusion` | 48638 | краткий итог и обобщение эффекта HSM | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: формулирует базовую проблему distributed storage systems, где replication даёт хорошее чтение, а EC снижает storage overhead, но ухудшает параллельность чтения горячих данных.
- Ключевые тезисы / аргументы: в existing hybrid storage papers обычно фиксируют правило `hot = replication, cold = EC`, но этого мало, если у системы меняется общий запас диска.
- Важные механизмы / модель / архитектура: авторы сразу подводят к идее, что схема хранения должна адаптироваться не только к heat, но и к `global disk space utilization`.
- Что отсюда брать в диплом: это удобная формулировка проблемы для введения и related work, особенно если нужно показать, почему temperature alone не закрывает задачу.

### 4.2 Background
- Что делает этот раздел: напоминает базовые свойства replication и RS-based erasure coding.
- Ключевые тезисы / аргументы: replication проста и быстра на чтении, но дорога по storage overhead; EC экономичнее, но добавляет encoding/decoding overhead и нагрузку на I/O.
- Важные механизмы / модель / архитектура: RS-код рассматривается как классический пример EC, где `n` data chunks и `m` parity chunks образуют stripe.
- Что отсюда брать в диплом: этот раздел даёт минимальный теоретический словарь для описания компромисса между read performance и storage efficiency.

### 4.3 Related Work
- Что делает этот раздел: показывает, что прежние hybrid approaches решали частные части проблемы, но не учитывали одновременно heat и глобальную заполненность дисков.
- Ключевые тезисы / аргументы: EC Fusion переключает коды по workload, ERP архивирует cold data из replication в RS, URSA смешивает SSD/HDD, HFPR опирается на potential replicas, но все эти подходы не дают той же двухсигнальной политики, что HSM.
- Важные механизмы / модель / архитектура: paper специально подводит к мысли, что fixed method selection часто либо ухудшает parallel read performance, либо слишком расходует disk space.
- Что отсюда брать в диплом: это хороший related work-блок для обоснования, почему нам нужен policy-driven hybrid storage, а не просто одна схема на все данные.

### 4.4 The Design of HSM
- Что делает этот раздел: описывает сам метод HSM через heat calculation, rules for utilization intervals и rack-aware placement.
- Ключевые тезисы / аргументы: heat измеряется как `H = N / T`, а по Zipf law верхние 20% по доступам считаются hot data, нижние 80% - cold data.
- Важные механизмы / модель / архитектура: при `utilization <= 30%` HSM предпочитает 3-way replication; при `30% < utilization <= 60%` hot data остаются на 3-way replication, а cold data переходят на 2-way replication; при `utilization > 60%` hot data переводятся на 2-way replication, а cold data архивируются в RS-схему.
- Что делает layout: main rack выбирается по лучшей bandwidth performance, 1st replica кладётся туда, а 2nd и 3rd replicas распределяются по secondary racks так, чтобы уменьшать cross-rack traffic при архивации и реконструкции.
- Что ещё важно: переходы между режимами реализуются через `data deletion`, `data reconstruction` и `data archiving`, а флаги `P` и `E` не дают системе бесконечно oscillate между режимами.
- Что отсюда брать в диплом: это прямой источник для описания temperature-aware switching и для аргументации, что policy должна учитывать не только heat, но и topology-aware transition cost.

### 4.5 Performance Evaluation
- Что делает этот раздел: сравнивает HSM с `ERP` и `RS(4,2)` по read time, storage overhead и cross-rack traffic/time during transitions.
- Ключевые тезисы / аргументы: при достаточном свободном месте HSM выигрывает по чтению; при нехватке места жертвует частью read performance ради storage efficiency; при смене схемы заметно снижает cross-rack cost по сравнению с ERP.
- Важные механизмы / модель / архитектура: экспериментальная установка - один сервер, `6` VM для имитации `6` racks, `128MB` chunks, сценарии `10%`, `40%` и `70%` заполненности, а также `50/100/150` chunks.
- Числа, метрики, результаты: при достаточном дисковом пространстве HSM снижает data reading time до `18%`; при низком дисковом пространстве storage overhead увеличивается до `7%`, но cross-rack data transfer traffic и time снижаются до `20%` и `15%` соответственно по сравнению с ERP в процессе смены схемы.
- Ограничения этого раздела: авторы сами отмечают, что не проверяли разные disk storage/RAM configurations, поэтому обобщать результаты на другие кластеры нужно осторожно.

### 4.6 Conclusion
- Что делает этот раздел: подводит итог тому, что HSM пытается балансировать read performance и storage overhead under different utilization scenarios.
- Ключевые тезисы / аргументы: схема полезна, когда нужно совместить hot-data parallelism и cold-data space savings, не игнорируя стоимость переходов между режимами.
- Что отсюда брать в диплом: итог статьи удобно использовать как короткую формулировку, почему hybrid storage policy должна смотреть на несколько сигналов сразу.

## 5. Архитектура и устройство системы / метода
- HSM - это не отдельный storage product с большим числом сервисов, а policy-driven method, который задаёт правила размещения, переключения и раскладки данных.
- Из статьи можно восстановить такие логические компоненты:
  - heat classifier, который считает `H = N / T` и делит data на hot/cold по Zipf rule;
  - utilization monitor, который отслеживает `global disk space utilization` и запускает смену режима;
  - placement manager, который распределяет replicas по main rack и secondary racks;
  - transition manager, который выполняет `3Replica`, `3to2Replica`, `2to3Replica`, `2toECO`, `ECto2Replica`, `data deletion`, `data reconstruction` и `data archiving`.
- Data path устроен так:
  - при низкой заполненности система держит data в `3-way replication`, чтобы максимизировать parallel reads;
  - при среднем заполнении hot data остаются в `3-way replication`, а cold data сокращаются до `2-way replication`;
  - при высокой заполненности hot data переводятся в `2-way replication`, а cold data архивируются в RS-based EC;
  - при возвращении данных из cold в hot используется reconstruction обратно в replication.
- Layout для replication:
  - 1st replica хранится на main rack с лучшей bandwidth performance;
  - 2nd и 3rd replica chunks распределяются по secondary racks на low-load nodes;
  - replicas одного объекта не кладутся на один и тот же node, чтобы сохранить node-level fault tolerance.
- Layout для EC:
  - при archiving 1st replica chunks, которые будут участвовать в encoding, стараются держать в main rack;
  - parity chunks тоже размещаются внутри main rack;
  - stripe layout балансируется так, чтобы сократить cross-rack traffic и усилить эффект partial decoding;
  - для stripes действуют ограничения на распределение chunk-ов между rack-ами, чтобы сохранить fault tolerance и не нарушить uniformity.
- Как читаются и меняются данные:
  - hot data читаются из replicas с минимальным decoding overhead;
  - EC используется для cold data, где важнее storage savings, чем read latency;
  - переходы между схемами сами по себе создают cross-rack cost, поэтому layout и flags `P` / `E` играют роль hysteresis.
- Что важно честно отметить: paper описывает architecture на уровне method and layout rules; отдельный metadata service не назван, а control state в тексте выражен через algorithmic rules, flags `P` / `E` и placement decisions.

## 6. Сквозные выводы по статье
- HSM показывает, что гибридная схема полезна только тогда, когда она учитывает не один сигнал, а минимум два: heat и global disk space utilization.
- Главный trade-off здесь тройной: read performance, storage overhead и cost of transitions between storage modes.
- Сильная сторона статьи - простая и воспроизводимая policy с порогами `30%` и `60%`, понятными переходами и rack-aware layout.
- Слабая сторона статьи - дискретность решения: thresholds заданы эвристически, а hot/cold split опирается на фиксированное `20% / 80%` правило.
- Ещё одно важное ограничение - узкая экспериментальная база: одна виртуализированная конфигурация не доказывает универсальность policy.

## 7. Что использовать в дипломе
- Можно брать как прямой baseline для формулировки `temperature-aware hybrid storage` и для аргумента, что схема хранения должна зависеть и от heat, и от общего состояния системы.
- Можно использовать `H = N / T`, `30%` и `60%`, а также `P / E` как пример простой hysteresis-policy.
- Можно взять rack-aware layout как источник идеи для уменьшения cross-rack traffic при migration, archiving и reconstruction.
- Можно использовать численные результаты по read time, storage overhead, cross-rack traffic и cross-rack time как empirical support.
- Нельзя переносить без оговорок саму heuristic policy как универсальный optimum: это baseline, а не окончательная оптимизация.

## 8. Полезные цитаты
- "adaptively selects appropriate storage methods"
  Стр.: 48630
  Зачем нужна: коротко фиксирует основную идею HSM как адаптивной policy.
- "the top 20% of user visits"
  Стр.: 48633
  Зачем нужна: показывает, как paper формализует hot/cold split через Zipf law.
- "reduces cross-rack data transfer traffic by up to 20%"
  Стр.: 48630
  Зачем нужна: даёт проверяемый численный итог по цене переходов между схемами.

## 9. Термины и понятия
- `Heat of data` - частота доступа к данным за выбранный временной интервал.
- `Global disk space utilization` - общая заполненность дисков в системе, используемая как управляющий сигнал.
- `3-way replication` - режим для hot data при достаточном или среднем свободном месте.
- `2-way replication` - промежуточный режим для cold data или для hot data при сильной нехватке места.
- `RS(n, m)` - erasure coding-режим, используемый для cold data при высокой заполненности дисков.
- `Main rack` - rack с лучшей bandwidth performance, куда кладут первую реплику и где стараются локализовать encoding work.
- `Secondary racks` - остальные racks, где хранятся 2nd и 3rd replicas.
- `Cross-rack traffic` - сетевой трафик между стойками, возникающий при архивации, реконструкции и смене схемы хранения.
- `Flag P / E` - метки, которыми HSM предотвращает лишние oscillation-переходы между режимами.

## 10. Итог в одном абзаце
HSM - это хороший системный baseline для диплома, потому что он напрямую связывает температуру данных и глобальное состояние кластера с выбором схемы хранения. Работа показывает, что фиксированное правило `hot = replication, cold = EC` слишком грубое: при разной заполненности дисков нужно по-разному балансировать чтение, storage overhead и стоимость переключений. Авторы предлагают простую, но практически полезную policy с тремя режимами по заполненности диска, переходами между `3-replica`, `2-replica` и `RS`-схемой, а также rack-aware layout для уменьшения cross-rack traffic. Для диплома источник особенно ценен как честный пример temperature-aware hybrid storage с понятными порогами, флагами `P / E` и измеримым эффектом, но его стоит использовать именно как baseline, а не как универсальную финальную стратегию.
