# Аудит покрытия источников

Дата: `2026-04-23`

Связанные каталоги проекта:

- [readme.md](./readme.md)
- [sources/meta.json](./sources/meta.json)
- [conspects/meta.json](./conspects/meta.json)
- [examples/meta.json](./examples/meta.json)

## 1. Состояние корпуса

До прошлого добора в каталоге было `18` источников.

После первой волны расширения были добавлены:

1. `tpds17_ear_2017`
2. `pacemaker_osdi_2020`
3. `cocytus_fast_2016`
4. `tiger_osdi_2022`

После текущей волны были добавлены и обработаны:

1. `cbase_ec_electronics_2021`
2. `greenhdfs_hotpower_2010`
3. `janus_atc_2013`
4. `hard_jbigdata_2019`
5. `plank_fast_2009`

Итоговый корпус сейчас содержит `27` источников.

После закрытия оставшихся пробелов по конспектам текущее состояние такое:

- в [sources/meta.json](./sources/meta.json) — `27` источников;
- в [conspects/meta.json](./conspects/meta.json) — `27` конспектов;
- покрытие корпуса конспектами теперь полное: `27/27`.

## 2. Broad Coverage С Пересечениями

Текущий overlap-подсчёт по главным зонам диплома:

- `репликация / hybrid / replication->EC`: `10`
- `температура / hot-cold / workload-aware`: `9`
- `transition / conversion / migration cost`: `12`
- `survey / benchmarking / evaluation`: `3`

Это означает, что после текущего добора корпус стал заметно более ровным:

- блок `replication -> EC / hybrid redundancy` уже закрыт не только `Morph` и `RapidRAID`, но и `EAR`, `CBase-EC`, `Cocytus`, `HaRD`;
- блок `temperature-aware policy` усилен не только `HSM`, `ELECT`, `ER-Store`, но и `CBase-EC`, `GreenHDFS`, `Janus`;
- блок `practical transitions` теперь покрыт не только `HeART` и `PACEMAKER`, но и `EAR`, `HaRD`, `CBase-EC`, а также policy-level migration papers вроде `GreenHDFS` и `Janus`;
- методология `evaluation` больше не держится почти целиком на одном systematic review: её теперь дополнительно поддерживает benchmark paper FAST'09.

## 3. Что Закрыл Финальный Добор Конспектов

После текущего интеграционного прохода полностью закрыты конспектами оставшиеся шесть источников:

1. `cocytus_fast_2016`
2. `tiger_osdi_2022`
3. `greenhdfs_hotpower_2010`
4. `janus_atc_2013`
5. `hard_jbigdata_2019`
6. `plank_fast_2009`

Что это дало по смыслу:

- `Cocytus` усилил practical hybrid baseline вне file/object storage и добавил полезные ограничения для metadata-heavy/update-heavy workloads;
- `Tiger` усилил блок `system-state-aware redundancy` и показал более современный вариант adaptive redundancy без жёстких placement restrictions;
- `GreenHDFS` и `Janus` закрыли policy-level слой с двух сторон: `temperature-driven migration` и `workload-aware fast-tier allocation`;
- `HaRD` добрал practical transition risk для сценария уменьшения replication factor;
- `Plank` закрыл методологический долг по benchmark/evaluation части.

### `cbase_ec_electronics_2021`

- Самый точный недостающий source для `hot/cold recognition + dynamic conversion`.
- Даёт двустороннюю логику `hot->cold` и `cold->hot`, а не только архивирование холодных данных.
- Полезен как bridge между `ER-Store` и более системными работами вроде `ELECT`.

### `greenhdfs_hotpower_2010`

- Закрывает практическую сторону `temperature-driven placement`.
- Показывает, как классификация данных реально управляет миграцией между hot/cold зонами, а не остаётся только аналитической метрикой.
- Полезен для аргумента, что policy на основе температуры должна учитывать стоимость переходов и периоды стабильной idle-активности.

### `janus_atc_2013`

- Усиливает policy-level блок для `workload-aware tiering`.
- Особенно полезен для раздела о том, как принимать решения по размещению данных между быстрым и медленным tier'ами на основе trace-driven characterization.
- Даёт production-grade аргументы, а не только лабораторную модель.

### `hard_jbigdata_2019`

- Закрывает недостающий кусок про безопасное уменьшение replication factor.
- Показывает, что переходы по числу реплик сами по себе могут портить data distribution, locality и network behavior, если не учитывать topology и heterogeneity.
- Хорошо дополняет `PACEMAKER`, который больше про bursty transition I/O и disk-adaptive redundancy.

### `plank_fast_2009`

- Это не paper про temperature policy, а точечное усиление `evaluation methodology`.
- Нужен для того, чтобы в дипломе был не только обзор систем и эвристик, но и опора на то, как вообще корректно сравнивать coding approaches на практике.

## 4. Что Теперь Всё Ещё Узко

После этого добора главный дефицит уже не в `temperature-aware policy` как таковой. Самые узкие места теперь такие:

- по-прежнему мало работ, которые в одном paper одновременно закрывают `temperature classification`, `replication <-> EC conversion` и `safe transition orchestration`;
- benchmarking/evaluation всё ещё слабее, чем системный корпус: `3` источника достаточно для опоры, но это всё ещё заметно меньше, чем количество design/system papers;
- мало современных strong primary papers именно про end-to-end orchestration всей цепочки `classify -> choose redundancy -> execute transition safely`.

Практически это означает: срочной дыры больше нет, но если добирать ещё, то следующий полезный слой должен быть не “ещё один paper про EC вообще”, а именно papers про `end-to-end policy orchestration` или сильные современные `benchmark/evaluation` источники.

## 5. Технический Статус

Технически корпус сейчас синхронизирован в двух слоях:

1. source-layer:
   - PDF находятся в `sources/files/`
   - extracted text находится в `sources/extracted/`
   - записи в `sources/meta.json` полные и содержат `27` источников
   - `sources/extracted/manifest.json` и `sources/extracted/abstracts.json` синхронизированы
2. conspect-layer:
   - все `27` источников имеют запись в `conspects/meta.json`
   - все `27` записей указывают на существующие `conspects/*.md`
   - `source_id`-сеты в `sources/meta.json` и `conspects/meta.json` совпадают без дубликатов и пропусков

Проверка после обновления:

- `sources/meta.json`: `27` записей
- `conspects/meta.json`: `27` записей
- `sources/extracted/manifest.json`: `27` записей
- `sources/extracted/abstracts.json`: `27` записей
- id-сеты source-layer и conspect-layer совпадают

## 6. Вывод

На этом этапе корпус уже выглядит не просто сбалансированным по источникам, но и полностью закрытым по конспектам. Значит, следующая рациональная работа — не новый широкий добор литературы, а synthesis по reading clusters и перенос этого synthesis в архитектурный design loop. Если добирать ещё что-то сверх текущего корпуса, то только очень точечно: в глубину по `end-to-end orchestration` и `evaluation`, а не в ширину по общим EC/system papers.
