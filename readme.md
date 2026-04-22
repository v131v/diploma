# Тема диплома "Разработка гибридной системы erasure coding и репликации на основе температуры данных"

Это развитие предыдущей Научно-Исследовательской Работы (НИР).

## Навигация

Основные документы проекта:

* [readme.md](./readme.md) - точка входа и актуальная структура проекта
* [formal-brief.md](./formal-brief.md) - формализованный бриф диплома
* [study-plan.md](./study-plan.md) - упорядоченный план изучения литературы
* [source-coverage-audit.md](./source-coverage-audit.md) - аудит покрытия корпуса источников

Рабочие материалы:

* [nir.pdf](./nir.pdf) - НИР
* [nir.txt](./nir.txt) - извлеченный текст НИР
* [sources/meta.json](./sources/meta.json) - каталог источников
* [conspects/meta.json](./conspects/meta.json) - мета-информация по конспектам
* [examples/meta.json](./examples/meta.json) - единый корпус бакалаврских ВКР без дублей

Локальные агенты и workflow:

* [.codex/agents/conspect-writer.toml](./.codex/agents/conspect-writer.toml) - подготовка новых конспектов
* [.codex/agents/conspect-reviewer.toml](./.codex/agents/conspect-reviewer.toml) - проверка и исправление конспектов
* [.codex/agents/architecture-writer.toml](./.codex/agents/architecture-writer.toml) - создание архитектурных вариантов
* [.codex/agents/architecture-reviewer.toml](./.codex/agents/architecture-reviewer.toml) - review архитектурных вариантов

## Структура

`sources/` - корпус источников.

* сюда складываются PDF, извлеченные тексты и мета-информация по статьям
* основной каталог корпуса: [sources/meta.json](./sources/meta.json)

`conspects/` - конспекты источников.

* каждый конспект привязан к источнику из `sources/`
* основной каталог конспектов: [conspects/meta.json](./conspects/meta.json)

`designs/` - варианты архитектуры дипломной системы и их review.

`examples/` - примеры и корпус ВКР.

* [examples/scrape_spbu_links.js](./examples/scrape_spbu_links.js) - локальный скрипт для сбора выдачи и карточек ВКР
* [examples/page_ex.html](./examples/page_ex.html) - пример HTML страницы списка
* [examples/vew_ex.html](./examples/vew_ex.html) - пример HTML страницы карточки
* [examples/meta.json](./examples/meta.json) - объединенный корпус бакалаврских ВКР после дедупликации

## Замечания по данным

Для `meta.json` в разделах проекта используется единая идея:

* `sources/meta.json` - мета-информация по литературе
* `conspects/meta.json` - мета-информация по конспектам
* `examples/meta.json` - мета-информация по собранным ВКР

Старые промежуточные query-выгрузки и временные top-списки в репозитории не хранятся: в рабочей структуре остаются только актуальные сводные артефакты.
