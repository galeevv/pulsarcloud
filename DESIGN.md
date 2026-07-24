# Pulsar Social Templates

Дизайн-спецификация для социальных материалов Pulsar.

- Figma: [Pulsar Social Templates](https://www.figma.com/design/VzEoDUMDrLFmqcxdorIq0p)
- Источник визуального языка: клиентский интерфейс PulsarVPN 2.0
- Логотип: `public/logo/Logo1.svg`
- Основной язык шаблонов: русский

## Назначение

Создать единую редактируемую систему публикаций для:

- Telegram и квадратных публикаций — `1080 × 1080`;
- Stories — `1080 × 1920`;
- широких обложек, анонсов и новостей — `1920 × 1080`.

Каждый формат должен иметь четыре варианта:

1. `Launch` — запуск Pulsar;
2. `News` — новости и обновления продукта;
3. `Status` — технические работы и состояние сервиса;
4. `Promo` — акции, бонусы и специальные предложения.

Итого: 12 готовых макетов.

## Визуальный язык

Стиль должен выглядеть как естественное продолжение клиентского интерфейса Pulsar:

- тёмный минималистичный фон;
- полупрозрачные графитовые панели;
- тонкие светлые границы толщиной `1 px`;
- крупная чистая типографика;
- мягкие сине-голубые свечения;
- орбитальные линии и Atom-логотип как основной графический мотив;
- много свободного пространства;
- без стоковых фотографий, перегруженных градиентов и декоративного шума;
- без имитации обычного сайта, dashboard или рекламного баннера из готового шаблона.

### Цвета

| Роль | Значение |
|---|---:|
| Canvas | `#0A0A0A` |
| Card | `#171717C7` |
| Muted surface | `#262626` |
| Primary text | `#FAFAFA` |
| Secondary text | `#A1A1A1` |
| Primary surface | `#E5E5E5` |
| Border | `#FFFFFF1A` |
| Strong border | `#FFFFFF26` |
| Brand blue | `#1447E6` |
| Glow cyan | `#90E1EA` |
| Glow blue | `#6ABFFF` |
| Success | `#5EC165` |
| Warning | `#F6CA70` |
| Danger | `#FF6467` |

Фон может использовать спокойный вертикальный переход от почти чёрного к `#0A0A0A`. Свечение применяется локально и не должно ухудшать читаемость текста.

### Типографика

Основной шрифт в Figma/Stitch — `Inter`, поскольку Segoe UI недоступен в текущей Figma-среде.

| Стиль | Размер | Межстрочный интервал |
|---|---:|---:|
| Display | `80 px` | `88 px` |
| Heading Large | `56 px` | `64 px` |
| Heading Medium | `40 px` | `48 px` |
| Body | `28 px` | `40 px` |
| Label | `20 px` | `28 px` |
| Caption | `16 px` | `24 px` |

Заголовки — Bold или Semi Bold. Основной текст — Regular. Короткие надписи верхнего регистра могут иметь letter spacing `1–2 px`.

### Геометрия

- Основные радиусы: `14`, `18`, `22`, `26 px`.
- Pills и компактные badges: полный радиус.
- Внутренние отступы строятся на сетке `4 px`.
- Основные значения отступов: `12`, `16`, `24`, `32`, `48`, `64`, `96 px`.
- Обычные карточки не используют тяжёлую тень.
- Допускается только мягкое синее свечение радиусом `32–120 px`.

## Компонент шаблона

Каждый макет должен быть экземпляром общего компонента `Social Template`.

### Варианты

- `Format`: `Telegram`, `Story`, `Landscape`;
- `Type`: `Launch`, `News`, `Status`, `Promo`.

### Редактируемые свойства

- `Eyebrow`;
- `Title`;
- `Body`;
- `CTA label`;
- `Footer`;
- `Show CTA`;
- `Show badge`;
- вложенный `Brand/Atom Mark`.

### Постоянные элементы

1. Atom-логотип и слово `PULSAR`.
2. Тематический badge.
3. Заголовок.
4. Короткое описание.
5. Необязательный CTA.
6. Footer `pulsar-cloud.space`.
7. Орбитальная графика или мягкое свечение на заднем плане.

## Форматы

### Telegram — 1080 × 1080

- Безопасная зона: минимум `64 px`.
- Заголовок: до трёх коротких строк.
- Основной контент располагается ближе к нижней половине.
- Логотип и badge находятся сверху.
- Footer находится у нижнего края безопасной зоны.

### Stories — 1080 × 1920

- Боковая безопасная зона: минимум `72 px`.
- Верхняя и нижняя безопасные зоны: минимум `140 px`.
- Заголовок: до четырёх строк.
- Контент не должен попадать под элементы интерфейса Instagram/Telegram Stories.
- Графический мотив можно увеличить и использовать в верхней трети.

### Landscape — 1920 × 1080

- Безопасная зона: минимум `96 px`.
- Контентная область занимает левую половину.
- Atom-графика и свечение занимают правую половину.
- Максимальная ширина текстового блока: `900 px`.
- Формат предназначен для широких обложек, Telegram-анонсов, видео-превью и новостных изображений.

## Сюжетные шаблоны

### Launch

- Badge: `PULSAR ЗАПУЩЕН`
- Eyebrow: `НОВЫЙ УРОВЕНЬ СВОБОДЫ`
- Title: `Pulsar уже работает`
- Body: `Быстрый и безопасный VPN без лишних настроек. Подключайтесь за пару минут.`
- CTA: `Подключиться`
- Footer: `pulsar-cloud.space`
- Акцент: Brand blue + Glow cyan/blue.
- Настроение: уверенный запуск продукта, технологичность, скорость и безопасность.

### News

- Badge: `НОВОСТИ`
- Eyebrow: `НОВОЕ В PULSAR`
- Title: `Pulsar стал ещё удобнее`
- Body: `Обновили личный кабинет и упростили подключение к VPN.`
- CTA: `Подробнее`
- Акцент: Glow blue.

### Status

- Badge: `СТАТУС СЕРВИСА`
- Eyebrow: `ВАЖНО`
- Title: `Технические работы`
- Body: `Сегодня с 03:00 до 03:30 возможны короткие перерывы в работе сервиса.`
- CTA: отсутствует;
- Акцент: Warning. Danger используется только для реальной аварии.

### Promo

- Badge: `АКЦИЯ`
- Eyebrow: `БОНУС ДЛЯ ДРУЗЕЙ`
- Title: `Месяц в подарок`
- Body: `Пригласите друга — бонус получат оба.`
- CTA: `Пригласить`
- Акцент: Success с небольшим Glow cyan.

## Требования к результату

- Все слои названы семантически.
- Текст остаётся редактируемым.
- Логотип используется как компонент, а не как растровое изображение.
- Для всех повторяющихся элементов используется auto layout.
- Цвета, отступы и радиусы связаны с переменными.
- Не растрировать готовые макеты.
- Проверить контраст, переносы русского текста и безопасные зоны.
- Не менять пропорции Atom-логотипа.
- Не добавлять Instagram Post `1080 × 1350`.

## Промт для Google Stitch

```text
Create an editable social media template system for the VPN product “Pulsar”.

Use this Figma file as the design reference:
https://www.figma.com/design/VzEoDUMDrLFmqcxdorIq0p

This is not a website, dashboard, or mobile app screen. Build a presentation board containing reusable social media artwork with named layers, reusable components, editable Russian text, and consistent safe zones.

Create 12 final artboards:

Formats:
1. Telegram square — 1080 × 1080
2. Story — 1080 × 1920
3. Landscape news cover — 1920 × 1080

Do not create a 1080 × 1350 Instagram Post format.

For every format create four variants:
1. Launch
2. News
3. Status
4. Promo

Visual direction:
- Match the existing Pulsar client interface.
- Minimal dark technology aesthetic.
- Canvas #0A0A0A.
- Translucent graphite surfaces #171717C7.
- Primary text #FAFAFA.
- Secondary text #A1A1A1.
- Thin 1 px borders #FFFFFF1A.
- Brand blue #1447E6.
- Cyan glow #90E1EA and blue glow #6ABFFF.
- Success #5EC165, warning #F6CA70, danger #FF6467.
- Use Inter.
- Use 14–26 px corner radii.
- Use generous spacing and a 4 px spacing grid.
- Use soft localized blue/cyan glow, orbital lines, and the Pulsar Atom logo.
- No stock photos, generic gradients, glassmorphism overload, visual noise, heavy shadows, or template-marketplace styling.

Create a reusable “Social Template” component with variants:
- Format: Telegram, Story, Landscape
- Type: Launch, News, Status, Promo

Expose editable properties:
- Eyebrow
- Title
- Body
- CTA label
- Footer
- Show CTA
- Show badge
- Brand/Atom Mark

Composition:
- Pulsar Atom logo and “PULSAR” at the top.
- Small semantic badge.
- Large editorial headline.
- Short supporting copy.
- Optional compact CTA.
- Footer “pulsar-cloud.space”.
- Orbit artwork or subtle glow as the background motif.

Safe zones:
- Telegram: 64 px on all sides.
- Story: 72 px left/right and 140 px top/bottom.
- Landscape: 96 px on all sides, copy on the left, Atom artwork on the right, maximum copy width 900 px.

Use the following Russian content:

LAUNCH
Badge: “PULSAR ЗАПУЩЕН”
Eyebrow: “НОВЫЙ УРОВЕНЬ СВОБОДЫ”
Title: “Pulsar уже работает”
Body: “Быстрый и безопасный VPN без лишних настроек. Подключайтесь за пару минут.”
CTA: “Подключиться”

NEWS
Badge: “НОВОСТИ”
Eyebrow: “НОВОЕ В PULSAR”
Title: “Pulsar стал ещё удобнее”
Body: “Обновили личный кабинет и упростили подключение к VPN.”
CTA: “Подробнее”

STATUS
Badge: “СТАТУС СЕРВИСА”
Eyebrow: “ВАЖНО”
Title: “Технические работы”
Body: “Сегодня с 03:00 до 03:30 возможны короткие перерывы в работе сервиса.”
Do not show a CTA.

PROMO
Badge: “АКЦИЯ”
Eyebrow: “БОНУС ДЛЯ ДРУЗЕЙ”
Title: “Месяц в подарок”
Body: “Пригласите друга — бонус получат оба.”
CTA: “Пригласить”

Keep all text editable, use auto layout for repeated structures, preserve the Atom logo proportions, and organize the result into clearly named sections for components and ready-to-export templates.
```
