#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/pulsar/pulsar.env
set +a

webhook_url=https://pulsar-cloud.space/api/integrations/telegram/webhook
bot_api="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

commands="$(jq -nc '[
  {command: "start", description: "Начать работу с Pulsar"},
  {command: "account", description: "Открыть личный кабинет"},
  {command: "notifications", description: "Настройки уведомлений"},
  {command: "help", description: "Помощь и список команд"}
  ]')"

commands_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setMyCommands" \
  --data-urlencode "commands=${commands}")"
jq -e '.ok == true and .result == true' <<<"$commands_response" >/dev/null
unset commands_response

commands_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setMyCommands" \
  --data-urlencode "commands=${commands}" \
  --data-urlencode 'language_code=ru')"
jq -e '.ok == true and .result == true' <<<"$commands_response" >/dev/null
unset commands_response commands

description_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setMyDescription" \
  --data-urlencode 'description=PulsarVPN помогает войти в личный кабинет, управлять подпиской и получать важные уведомления.')"
jq -e '.ok == true and .result == true' <<<"$description_response" >/dev/null
unset description_response

short_description_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setMyShortDescription" \
  --data-urlencode 'short_description=Вход, подписка и уведомления PulsarVPN')"
jq -e '.ok == true and .result == true' <<<"$short_description_response" >/dev/null
unset short_description_response

response="$(curl -fsS \
  --request POST \
  "${bot_api}/setWebhook" \
  --data-urlencode "url=${webhook_url}" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]')"
jq -e '.ok == true' <<<"$response" >/dev/null
unset response

info="$(curl -fsS \
  "${bot_api}/getWebhookInfo")"
jq -e --arg expected "$webhook_url" \
  '.ok == true and .result.url == $expected' <<<"$info" >/dev/null
jq '{ok, url: .result.url, pendingUpdateCount: .result.pending_update_count,
  lastErrorDate: .result.last_error_date, lastErrorMessage: .result.last_error_message}' \
  <<<"$info"

configured_commands="$(curl -fsS "${bot_api}/getMyCommands?language_code=ru")"
jq -e '.ok == true and ([.result[].command] == ["start", "account", "notifications", "help"])' \
  <<<"$configured_commands" >/dev/null
jq '{commands: [.result[].command]}' <<<"$configured_commands"
unset configured_commands info bot_api
