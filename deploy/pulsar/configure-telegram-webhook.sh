#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/pulsar/pulsar.env
set +a

webhook_url=https://pulsar-cloud.space/api/integrations/telegram/webhook
bot_api="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

commands="$(jq -nc '[
  {command: "start", description: "Открыть меню PULSAR"}
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

menu_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setChatMenuButton" \
  --data-urlencode 'menu_button={"type":"commands"}')"
jq -e '.ok == true and .result == true' <<<"$menu_response" >/dev/null
unset menu_response

name_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setMyName" \
  --data-urlencode 'name=PULSAR')"
jq -e '.ok == true and .result == true' <<<"$name_response" >/dev/null
unset name_response

name_response="$(curl -fsS \
  --request POST \
  "${bot_api}/setMyName" \
  --data-urlencode 'name=PULSAR' \
  --data-urlencode 'language_code=ru')"
jq -e '.ok == true and .result == true' <<<"$name_response" >/dev/null
unset name_response

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
  --data-urlencode 'allowed_updates=["message","callback_query","my_chat_member"]')"
jq -e '.ok == true' <<<"$response" >/dev/null
unset response

info="$(curl -fsS \
  "${bot_api}/getWebhookInfo")"
jq -e --arg expected "$webhook_url" \
  '.ok == true and .result.url == $expected and
   (.result.allowed_updates == ["message", "callback_query", "my_chat_member"])' \
  <<<"$info" >/dev/null
jq '{ok, url: .result.url, pendingUpdateCount: .result.pending_update_count,
  allowedUpdates: .result.allowed_updates,
  lastErrorDate: .result.last_error_date, lastErrorMessage: .result.last_error_message}' \
  <<<"$info"

configured_commands="$(curl -fsS "${bot_api}/getMyCommands?language_code=ru")"
jq -e '.ok == true and ([.result[].command] == ["start"])' \
  <<<"$configured_commands" >/dev/null
jq '{commands: [.result[].command]}' <<<"$configured_commands"
unset configured_commands

configured_commands="$(curl -fsS "${bot_api}/getMyCommands")"
jq -e '.ok == true and ([.result[].command] == ["start"])' \
  <<<"$configured_commands" >/dev/null
unset configured_commands

configured_menu="$(curl -fsS "${bot_api}/getChatMenuButton")"
jq -e '.ok == true and .result.type == "commands"' \
  <<<"$configured_menu" >/dev/null
unset configured_menu

configured_name="$(curl -fsS "${bot_api}/getMyName")"
jq -e '.ok == true and .result.name == "PULSAR"' \
  <<<"$configured_name" >/dev/null
unset configured_name

configured_name="$(curl -fsS "${bot_api}/getMyName?language_code=ru")"
jq -e '.ok == true and .result.name == "PULSAR"' \
  <<<"$configured_name" >/dev/null
unset configured_name

configured_description="$(curl -fsS "${bot_api}/getMyDescription")"
jq -e '.ok == true and .result.description == "PulsarVPN помогает войти в личный кабинет, управлять подпиской и получать важные уведомления."' \
  <<<"$configured_description" >/dev/null
unset configured_description

configured_short_description="$(curl -fsS "${bot_api}/getMyShortDescription")"
jq -e '.ok == true and .result.short_description == "Вход, подписка и уведомления PulsarVPN"' \
  <<<"$configured_short_description" >/dev/null
unset configured_short_description info bot_api
