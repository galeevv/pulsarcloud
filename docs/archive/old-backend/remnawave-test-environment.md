# Remnawave test environment

## Topology

The temporary verification topology runs Panel, Subscription Page, Node, Pulsar
web, worker, and SQLite on `31.76.27.41`. Remnawave recommends a separate Node;
this same-VPS layout is only for billing/provisioning verification.

Configured objects:

| Object           | Value                                 |
| ---------------- | ------------------------------------- |
| Profile          | `PULSAR_VLESS_REALITY`                |
| Node             | `PULSAR_TEST_NODE`                    |
| Standard inbound | `PULSAR_STANDARD_REALITY`, TCP `8443` |
| LTE inbound      | `PULSAR_LTE_REALITY`, TCP `8444`      |
| Standard squad   | `PULSAR_STANDARD`                     |
| LTE squad        | `PULSAR_LTE`                          |
| Standard host    | `Pulsar Standard Test`                |
| LTE host         | `Pulsar LTE Test`                     |

Both inbounds use VLESS Reality with separate key pairs and block private
destinations and BitTorrent. The LTE inbound is a logical entitlement test; it
does not provide a real mobile/LTE egress on this VPS.

The Node API listens on `2222`, but UFW allows it only from the Remnawave Docker
bridge. Client ports `8443` and `8444` are public. `edge-ru1.pulsar-cloud.space`
does not yet resolve, so test Hosts currently use the server IP.

## Verification

After a confirmed Platega payment:

1. Register a test user.
2. Choose a plan without LTE and complete the payment.
3. Wait for the signed Platega callback.
4. Wait for `PROVISION_SUBSCRIPTION` to succeed.
5. Confirm the user has only `PULSAR_STANDARD` in Remnawave.
6. Repeat with LTE enabled and confirm both squads are assigned.
7. Open the subscription URL in a supported client.
8. Confirm the HWID limit equals the paid device limit.

## Production transition

- Add an A record for `edge-ru1.pulsar-cloud.space` and replace IP Hosts.
- Move LTE to a separate VPS and create a real LTE egress/profile.
- Move the standard Node away from the Panel when capacity allows.
- Rotate all credentials and Reality keys that have ever been exposed.
