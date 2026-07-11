ARCHIVED: документ описывает удаленную реализацию backend и не является актуальной архитектурой Pulsar 2.0.

# Pulsar 2.0: политика Remnawave для dev/test

Дата фиксации: 2026-07-11.

## Созданные объекты

| Объект | UUID | Назначение |
|---|---|---|
| Config Profile `PULSAR_VLESS_REALITY` | `2a11675d-a338-4772-b6d7-b9ec258e40fe` | Xray profile для обычных VPN-нод |
| Inbound `VLESS_TCP_REALITY` | `37de60df-904f-44a1-afa1-2ebae5b5bdee` | VLESS поверх TCP (`raw` в актуальном Xray) с REALITY |
| Internal Squad `PULSAR_STANDARD` | `4f9b09ab-fd40-4f0f-affc-b62527f5afa0` | Все обычные ноды Pulsar |
| Internal Squad `PULSAR_LTE` | `8f563aa5-89f0-4e23-b7f7-9d33b90b1f55` | Опциональные LTE-ноды; сейчас пуст |
| Subscription Template `PULSAR_XRAY` | `38f1fba0-635f-46eb-8970-799b4abea551` | Отдельный XRAY_JSON template Pulsar |

REALITY private key создан встроенным генератором Remnawave и хранится только
в конфигурации Panel. В документацию и вывод команд он не копируется. Текущий
маскирующий target/SNI — `www.microsoft.com:443` / `www.microsoft.com`.

Client fingerprint должен быть `edge`. Он задается на объекте Host, поэтому
окончательно применить и проверить `fp=edge` можно после подключения отдельной
VPN-ноды и создания Host с ее реальным адресом. Создавать фиктивный Host нельзя.

## Правила выдачи доступа

- любой оплаченный тариф получает `PULSAR_STANDARD`;
- при `lteEnabled=false` пользователь состоит только в `PULSAR_STANDARD`;
- при `lteEnabled=true` пользователь состоит одновременно в
  `PULSAR_STANDARD` и `PULSAR_LTE`;
- LTE-squad остается пустым до подключения отдельного LTE-сервера;
- лимит трафика: `trafficLimitBytes=0` (безлимит);
- сброс трафика: `trafficLimitStrategy=NO_RESET`;
- лимит устройств: `hwidDeviceLimit=Subscription.deviceLimit`, допустимый
  диапазон приложения сейчас 1–5;
- HWID включен глобально, fallback limit равен 1;
- пользователь может удалить только HWID собственного Remnawave user через
  `GET /api/hwid/devices/{userUuid}` и `POST /api/hwid/devices/delete`;
- серверное действие удаления обязано получать Remnawave UUID из авторизованной
  подписки, а не принимать чужой `userUuid` от браузера.

Важно: HWID поддерживают не все VPN-клиенты. При включенной политике клиент без
поддержки HWID не сможет использовать подписку. До публичного запуска нужно
зафиксировать список поддерживаемых приложений.

## Истечение и продление

Для статусов `EXPIRED`, `DISABLED`, `LIMITED`, превышения HWID и отсутствия
хостов в Subscription Settings заданы русские служебные remarks со ссылкой на
`https://app.pulsar-cloud.space`. Для истекшей подписки список нод заменяется
сообщением о необходимости продления.

Поведение проверено end-to-end временным пользователем и HWID-заголовками:
после перехода пользователя в `EXPIRED` публичная subscription-ссылка вернула
VLESS placeholder вместо реальных нод; его remark содержит текст об окончании
подписки и URL приложения. Тестовые user и HWID device после проверки удалены.

Продление не создает нового пользователя Remnawave:

1. Pulsar читает сохраненный `Subscription.remnawaveUserId`.
2. Если UUID есть, вызывается `PATCH /api/users` по `uuid` с новым `expireAt`,
   `status=ACTIVE`, актуальными squads и `hwidDeviceLimit`.
3. `trafficLimitBytes` остается 0, стратегия — `NO_RESET`.
4. `POST /api/users` разрешен только при первом provisioning, когда UUID еще нет.
5. Результат операции сохраняется идемпотентно; существующий subscription URL
   не регенерируется без отдельного запроса пользователя/администратора.

## Секреты и переменные

На VPS уже настроены `REMNAWAVE_BASE_URL` и отдельный API token Pulsar в
`/etc/pulsar/pulsar.env` (mode `0640`, `root:pulsar`). Значение token не должно
попадать в Git, Markdown или чат. UUID и policy-переменные также добавлены в этот
env-файл.

`REMNAWAVE_WEBHOOK_SECRET` пока не активирован: в Pulsar отсутствует проверенный
Remnawave webhook handler. Включать Panel webhook до появления handler нельзя,
иначе события будут теряться. Секрет нужно сгенерировать при реализации route,
одновременно настроить `WEBHOOK_ENABLED`, `WEBHOOK_URL` и проверку secret header.

## Реальные блокеры

- Node и Host отсутствуют: нужен отдельный VPN VPS (IP/домен и SSH-доступ).
- Нельзя проверить REALITY handshake, `fp=edge`, трафик или выдачу рабочих нод
  без отдельного Node.
- Pulsar использует `MockRemnawaveClient`; реальные create/update user, squads,
  HWID list/delete и renewal пока не вызываются сайтом.
- Карточка устройств в личном кабинете сейчас рисует свободные слоты и не
  загружает реальные HWID устройства.

## Следующий приемочный тест после выдачи VPN VPS

1. Установить официальный Remnawave Node на отдельный сервер.
2. Создать Node с профилем `PULSAR_VLESS_REALITY` и inbound
   `VLESS_TCP_REALITY`.
3. Создать Host с реальным адресом Node, портом 443, security `reality` и
   fingerprint `edge`.
4. Добавить тестового пользователя в `PULSAR_STANDARD`, выставить
   `trafficLimitBytes=0`, `NO_RESET` и нужный `hwidDeviceLimit`.
5. Проверить подключение, повторное устройство, отвязку HWID, истечение и
   продление того же UUID.
